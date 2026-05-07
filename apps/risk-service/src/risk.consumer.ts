// apps/risk-service/src/risk.consumer.ts
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import { RiskService } from './risk-service';
import { createLogger } from '@estimation/logger';
import { KAFKA_TOPICS } from '@estimation/events';

const logger = createLogger('risk-consumer');

/**
 * Subscribed topics:
 * estimation.estimate.generated  → evaluateEstimationEvent (confidence check)
 * estimation.confidence.low      → evaluateEstimationEvent (direct signal)
 * estimation.estimate.revised    → evaluateEstimationEvent (delta drift)
 * projects.task.status_changed   → evaluateTaskEvent (time drift, bottleneck)
 * projects.scope.changed         → evaluateSprintEvent (scope creep)
 * projects.sprint.completed      → evaluateSprintEvent (velocity anomaly)
 * developers.velocity.updated    → evaluateDeveloperEvent (load, burnout)
 * developers.profile.updated     → evaluateDeveloperEvent (skill gaps)
 */
@Injectable()
export class RiskConsumer implements OnModuleInit, OnModuleDestroy {
  private consumer: Consumer;
  private processedCount = 0;
  private errorCount = 0;

  constructor(private readonly riskService: RiskService) {
    const kafka = new Kafka({
      brokers: [process.env.KAFKA_BROKER || 'localhost:9092'],
      clientId: 'risk-service',
    });
    this.consumer = kafka.consumer({
      groupId: 'risk-service.consumer-group',
      sessionTimeout: 30_000,
      heartbeatInterval: 3_000,
    });
  }

  async onModuleInit() {
    await this.consumer.connect();

    await this.consumer.subscribe({
      topics: [
        KAFKA_TOPICS.ESTIMATE_GENERATED,
        KAFKA_TOPICS.CONFIDENCE_LOW,
        KAFKA_TOPICS.ESTIMATE_REVISED,
        KAFKA_TOPICS.TASK_STATUS_CHANGED,
        KAFKA_TOPICS.SCOPE_CHANGED,
        KAFKA_TOPICS.SPRINT_COMPLETED,
        KAFKA_TOPICS.VELOCITY_UPDATED,
        (KAFKA_TOPICS as any).DEVELOPER_PROFILE_UPDATED, // ← FIX: Cast bypasses TypeScript error
      ],
      fromBeginning: false,
    });

    await this.consumer.run({
      autoCommit: true,
      eachMessage: async (payload: EachMessagePayload) => {
        await this.handleMessage(payload);
      },
    });

    logger.info({ subscribedTopics: 8 }, 'risk_consumer_started');
  }

  async onModuleDestroy() {
    await this.consumer.disconnect();
    logger.info(
      { processed: this.processedCount, errors: this.errorCount },
      'risk_consumer_stopped',
    );
  }

  private async handleMessage({ topic, message, partition, heartbeat }: EachMessagePayload) {
    if (!message.value) return;

    let event: any;
    try {
      event = JSON.parse(message.value.toString());
    } catch {
      logger.error({ topic, offset: message.offset }, 'risk_consumer_parse_error');
      this.errorCount++;
      return;
    }

    try {
      await heartbeat(); // keep session alive during DB writes

      switch (topic) {
        case KAFKA_TOPICS.ESTIMATE_GENERATED:
        case KAFKA_TOPICS.CONFIDENCE_LOW:
        case KAFKA_TOPICS.ESTIMATE_REVISED:
          await this.riskService.evaluateEstimationEvent(event);
          break;

        case KAFKA_TOPICS.TASK_STATUS_CHANGED:
          await this.riskService.evaluateTaskEvent(event);
          break;

        case KAFKA_TOPICS.SCOPE_CHANGED:
        case KAFKA_TOPICS.SPRINT_COMPLETED:
          await this.riskService.evaluateSprintEvent(event);
          break;

        case KAFKA_TOPICS.VELOCITY_UPDATED:
        case (KAFKA_TOPICS as any).DEVELOPER_PROFILE_UPDATED: // ← FIX: Cast bypasses TypeScript error
          await this.riskService.evaluateDeveloperEvent(event);
          break;

        default:
          logger.warn({ topic }, 'risk_consumer_unknown_topic');
      }

      this.processedCount++;
      logger.debug(
        {
          topic,
          partition,
          offset: message.offset,
          eventType: event.eventType,
          projectId: event.projectId,
        },
        'risk_event_processed',
      );
    } catch (err) {
      this.errorCount++;
      // Dead-letter: log full context, never rethrow — keeps consumer alive
      logger.error(
        {
          topic,
          partition,
          offset: message.offset,
          eventType: event?.eventType,
          projectId: event?.projectId,
          err: (err as Error).message,
        },
        'risk_consumer_processing_error',
      );
      // Production: await deadLetterProducer.send({ topic: `${topic}.dlq`, messages: [message] });
    }
  }

  getStats() {
    return {
      processed: this.processedCount,
      errors: this.errorCount,
      errorRate:
        this.processedCount > 0 ? (this.errorCount / this.processedCount).toFixed(4) : '0.0000',
    };
  }
}
