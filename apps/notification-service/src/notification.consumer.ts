// apps/notification-service/src/notification.consumer.ts
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import { NotificationService } from './notification-service.service';
import { createLogger } from '@estimation/logger';
import { KAFKA_TOPICS } from '@estimation/events';

const logger = createLogger('notification-consumer');

@Injectable()
export class NotificationConsumer implements OnModuleInit, OnModuleDestroy {
  private consumer: Consumer;
  private processedCount = 0;
  private errorCount = 0;

  constructor(private readonly notificationService: NotificationService) {
    const kafka = new Kafka({
      clientId: 'notification-service',
      brokers: [(process.env.KAFKA_BROKER || 'localhost:9092')],
    });
    this.consumer = kafka.consumer({
      groupId: 'notification-service.consumer-group',
      sessionTimeout: 30_000,
      heartbeatInterval: 3_000,
    });
  }

  async onModuleInit() {
    await this.consumer.connect();

    await this.consumer.subscribe({
      topics: [
        KAFKA_TOPICS.RISK_ALERT,
        KAFKA_TOPICS.ESTIMATE_GENERATED,
        KAFKA_TOPICS.CONFIDENCE_LOW,
        KAFKA_TOPICS.SPRINT_COMPLETED,
      ],
      fromBeginning: false,
    });

    await this.consumer.run({
      autoCommit: true,
      eachMessage: async (payload: EachMessagePayload) => {
        await this.handleMessage(payload);
      },
    });

    logger.info({ subscribedTopics: 4 }, 'notification_consumer_started');
  }

  async onModuleDestroy() {
    await this.consumer.disconnect();
    logger.info({ processed: this.processedCount, errors: this.errorCount }, 'notification_consumer_stopped');
  }

  private async handleMessage({ topic, message, heartbeat }: EachMessagePayload) {
    if (!message.value) return;

    let event: any;
    try {
      event = JSON.parse(message.value.toString());
    } catch {
      logger.error({ topic, offset: message.offset }, 'notification_parse_error');
      this.errorCount++;
      return;
    }

    try {
      await heartbeat();

      let notificationPayload;
      switch (topic) {
        case KAFKA_TOPICS.RISK_ALERT:
          notificationPayload = this.notificationService.buildRiskNotification(event);
          break;
        case KAFKA_TOPICS.ESTIMATE_GENERATED:
        case KAFKA_TOPICS.CONFIDENCE_LOW:
          notificationPayload = this.notificationService.buildEstimationNotification(event);
          break;
        case KAFKA_TOPICS.SPRINT_COMPLETED:
          notificationPayload = this.notificationService.buildSprintCompletedNotification(event);
          break;
        default:
          logger.warn({ topic }, 'notification_unknown_topic');
          return;
      }

      await this.notificationService.dispatchToRecipients(notificationPayload);
      this.processedCount++;

      logger.debug(
        { topic, eventType: event.eventType, projectId: event.projectId },
        'notification_event_processed',
      );
    } catch (err) {
      this.errorCount++;
      logger.error(
        {
          topic,
          eventType: event?.eventType,
          projectId: event?.projectId,
          err: (err as Error).message,
        },
        'notification_processing_error',
      );
      // Dead-letter: production would push to `${topic}.dlq`
    }
  }

  getStats() {
    return {
      processed: this.processedCount,
      errors: this.errorCount,
      errorRate: this.processedCount > 0
        ? (this.errorCount / this.processedCount).toFixed(4)
        : '0.0000',
    };
  }
}