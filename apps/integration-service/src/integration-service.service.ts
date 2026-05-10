// apps/integration-service/src/integration-service.service.ts  ← PHASE 1 UPGRADE
import { Injectable } from '@nestjs/common';
import { createLogger } from '@estimation/logger';
import { KAFKA_TOPICS } from '@estimation/events';
import { Kafka } from 'kafkajs';
import { JiraConnector } from './connectors/jira-connector';
import { GitHubConnector } from './connectors/github-connector';
import { SonarQubeConnector } from './connectors/sonarqube-connector';
import { CanonicalEvent } from './connectors/connector.interface';
import * as crypto from 'crypto';

const logger = createLogger('integration-service');
const kafka = new Kafka({ brokers: [process.env.KAFKA_BROKER || 'localhost:9092'] });
const producer = kafka.producer();

export interface ConnectorStatus {
  name: string;
  enabled: boolean;
  lastSyncAt: string | null;
  error: string | null;
}

@Injectable()
export class IntegrationService {
  private jira = new JiraConnector();
  private github = new GitHubConnector();
  private sonar = new SonarQubeConnector();
  private statusMap = new Map<string, ConnectorStatus>();

  async onModuleInit() {
    try {`n      await producer.connect();`n    } catch (e) {`n      console.warn('[integration-service] Kafka not available - events will not be published', e.message);`n    };
    this.statusMap.set('jira', { name: 'Jira', enabled: true, lastSyncAt: null, error: null });
    this.statusMap.set('github', { name: 'GitHub', enabled: true, lastSyncAt: null, error: null });
    this.statusMap.set('sonarqube', {
      name: 'SonarQube',
      enabled: true,
      lastSyncAt: null,
      error: null,
    });
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
    this.updateStatus('jira', null);
    logger.info({ count: events.length }, 'jira_events_published');
    return { received: true, processedEvents: events.length };
  }

  async handleGitHubWebhook(payload: any, signature: string, rawBody: string) {
    const secret = process.env.GITHUB_WEBHOOK_SECRET ?? '';
    if (secret && !this.verifyHmac(rawBody, signature, secret, 'sha256')) {
      logger.warn('GitHub webhook signature verification failed');
      throw new Error('Invalid signature');
    }

    const events = await this.github.handleWebhookPayload(payload);
    await this.publishEvents(events, KAFKA_TOPICS.GITHUB_COMMIT);
    this.updateStatus('github', null);
    logger.info({ count: events.length }, 'github_events_published');
    return { received: true, processedEvents: events.length };
  }

  async handleSonarWebhook(payload: any, signature: string, rawBody: string) {
    const secret = process.env.SONAR_WEBHOOK_SECRET ?? '';
    if (secret && !this.verifyHmac(rawBody, signature, secret, 'sha256')) {
      logger.warn('SonarQube webhook signature verification failed');
      throw new Error('Invalid signature');
    }

    const events = await this.sonar.handleWebhookPayload(payload);
    // SonarQube events: publish on JIRA_SYNCED channel (tech debt updates)
    await this.publishEvents(events, KAFKA_TOPICS.JIRA_SYNCED);
    this.updateStatus('sonarqube', null);
    logger.info({ count: events.length }, 'sonar_events_published');
    return { received: true, processedEvents: events.length };
  }

  getIntegrationStatus() {
    return {
      connectors: Array.from(this.statusMap.values()),
    };
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
            value: JSON.stringify(event),
          },
        ],
      });
    }
  }

  private verifyHmac(body: string, signature: string, secret: string, algo: string): boolean {
    const expected = `${algo}=` + crypto.createHmac(algo, secret).update(body).digest('hex');
    try {
      return crypto.timingSafeEqual(Buffer.from(expected), Buffer.from(signature));
    } catch {
      return false;
    }
  }

  private updateStatus(connector: string, error: string | null) {
    const existing = this.statusMap.get(connector);
    if (existing) {
      this.statusMap.set(connector, {
        ...existing,
        lastSyncAt: error ? existing.lastSyncAt : new Date().toISOString(),
        error,
      });
    }
  }
}


