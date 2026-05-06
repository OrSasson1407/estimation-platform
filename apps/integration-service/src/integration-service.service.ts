// apps/integration-service/src/integration-service.service.ts  ← NEW
import { Injectable } from '@nestjs/common';
import { createLogger } from '@estimation/logger';
import { KAFKA_TOPICS } from '@estimation/events';
import { Kafka } from 'kafkajs';
import { JiraConnector } from './connectors/jira-connector';
import { GitHubConnector } from './connectors/github-connector';
import { CanonicalEvent } from './connectors/connector.interface';

const logger = createLogger('integration-service');
const kafka = new Kafka({ brokers: [process.env.KAFKA_BROKER || 'localhost:9092'] });
const producer = kafka.producer();

@Injectable()
export class IntegrationService {
  private jira = new JiraConnector();
  private github = new GitHubConnector();

  async onModuleInit() {
    await producer.connect();
  }

  async onModuleDestroy() {
    await producer.disconnect();
  }

  async handleJiraWebhook(payload: any, signature: string, rawBody: string) {
    const secret = process.env.JIRA_WEBHOOK_SECRET ?? '';
    if (secret && !this.jira.verifySignature(rawBody, signature, secret)) {
      logger.warn('Jira webhook signature verification failed');
      throw new Error('Invalid signature');
    }

    const events = await this.jira.handleWebhookPayload(payload);
    await this.publishEvents(events, KAFKA_TOPICS.JIRA_SYNCED);
    logger.info({ count: events.length }, 'jira_events_published');
    return { received: true, processedEvents: events.length };
  }

  async handleGitHubWebhook(payload: any, signature: string, rawBody: string) {
    const secret = process.env.GITHUB_WEBHOOK_SECRET ?? '';
    if (secret && !this.verifyGitHubSignature(rawBody, signature, secret)) {
      logger.warn('GitHub webhook signature verification failed');
      throw new Error('Invalid signature');
    }

    const events = await this.github.handleWebhookPayload(payload);
    await this.publishEvents(events, KAFKA_TOPICS.GITHUB_COMMIT);
    logger.info({ count: events.length }, 'github_events_published');
    return { received: true, processedEvents: events.length };
  }

  private async publishEvents(events: CanonicalEvent[], defaultTopic: string) {
    for (const event of events) {
      const topic = event.eventType.startsWith('integrations.github')
        ? KAFKA_TOPICS.GITHUB_COMMIT
        : defaultTopic;

      await producer.send({
        topic,
        messages: [
          {
            key: event.eventId,
            value: JSON.stringify({
              eventId: event.eventId,
              eventType: event.eventType,
              version: event.version,
              timestamp: event.timestamp,
              orgId: event.orgId,
              projectId: event.projectId,
              data: event.data,
            }),
          },
        ],
      });
    }
  }

  private verifyGitHubSignature(body: string, signature: string, secret: string): boolean {
    const crypto = require('crypto');
    const expected = 'sha256=' + crypto.createHmac('sha256', secret).update(body).digest('hex');
    try {
      return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
    } catch {
      return false;
    }
  }
}
