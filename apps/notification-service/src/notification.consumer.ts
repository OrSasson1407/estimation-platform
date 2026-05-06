// apps/notification-service/src/notification.consumer.ts  ← NEW: Kafka consumer
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import { NotificationService } from './notification-service.service';
import { createLogger } from '@estimation/logger';
import { KAFKA_TOPICS } from '@estimation/events';

const logger = createLogger('notification-consumer');

@Injectable()
export class NotificationConsumer implements OnModuleInit, OnModuleDestroy {
  private consumer: Consumer;

  constructor(private readonly notificationService: NotificationService) {
    const kafka = new Kafka({ brokers: [process.env.KAFKA_BROKER || 'localhost:9092'] });
    this.consumer = kafka.consumer({ groupId: 'notification-service.consumer-group' });
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
      eachMessage: async ({ topic, message }: EachMessagePayload) => {
        if (!message.value) return;
        try {
          const event = JSON.parse(message.value.toString());
          let payload;

          if (topic === KAFKA_TOPICS.RISK_ALERT) {
            payload = this.notificationService.buildRiskNotification(event);
          } else if (
            topic === KAFKA_TOPICS.ESTIMATE_GENERATED ||
            topic === KAFKA_TOPICS.CONFIDENCE_LOW
          ) {
            payload = this.notificationService.buildEstimationNotification(event);
          } else if (topic === KAFKA_TOPICS.SPRINT_COMPLETED) {
            payload = this.notificationService.buildSprintCompletedNotification(event);
          }

          if (payload) await this.notificationService.dispatch(payload);
        } catch (err) {
          logger.error({ topic, err }, 'notification_consumer_error');
        }
      },
    });

    logger.info('Notification Kafka consumer started');
  }

  async onModuleDestroy() {
    await this.consumer.disconnect();
  }
}
