// apps/analytics-service/src/analytics.consumer.ts  ← NEW: Kafka consumer
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import { AnalyticsService } from './analytics-service.service';
import { createLogger } from '@estimation/logger';
import { KAFKA_TOPICS } from '@estimation/events';

const logger = createLogger('analytics-consumer');

@Injectable()
export class AnalyticsConsumer implements OnModuleInit, OnModuleDestroy {
  private consumer: Consumer;

  constructor(private readonly analyticsService: AnalyticsService) {
    const kafka = new Kafka({ brokers: [process.env.KAFKA_BROKER || 'localhost:9092'] });
    this.consumer = kafka.consumer({ groupId: 'analytics-service.consumer-group' });
  }

  async onModuleInit() {
    await this.consumer.connect();

    await this.consumer.subscribe({
      topics: [
        KAFKA_TOPICS.ESTIMATE_GENERATED,
        KAFKA_TOPICS.SPRINT_COMPLETED,
        KAFKA_TOPICS.RISK_ALERT,
      ],
      fromBeginning: false,
    });

    await this.consumer.run({
      eachMessage: async ({ topic, message }: EachMessagePayload) => {
        if (!message.value) return;
        try {
          const event = JSON.parse(message.value.toString());

          if (topic === KAFKA_TOPICS.ESTIMATE_GENERATED) {
            await this.analyticsService.recordEstimationEvent({
              eventId: event.eventId,
              taskId: event.data.taskId,
              projectId: event.projectId,
              orgId: event.orgId,
              expectedHours: event.data.expectedHours,
              confidenceScore: event.data.confidenceScore,
              modelVersion: event.data.modelVersion,
            });
          }

          if (topic === KAFKA_TOPICS.SPRINT_COMPLETED) {
            await this.analyticsService.recordSprintVelocity({
              sprintId: event.data.sprintId,
              projectId: event.projectId,
              orgId: event.orgId,
              completedPoints: event.data.completedPoints,
              plannedPoints: event.data.plannedPoints,
              velocityScore: event.data.velocityScore,
            });
          }

          if (topic === KAFKA_TOPICS.RISK_ALERT) {
            await this.analyticsService.recordRiskEvent({
              riskId: event.data.riskId,
              projectId: event.projectId,
              orgId: event.orgId,
              severity: event.data.severity,
              category: event.data.category,
            });
          }
        } catch (err) {
          logger.error({ topic, err }, 'analytics_consumer_error');
        }
      },
    });

    logger.info('Analytics Kafka consumer started');
  }

  async onModuleDestroy() {
    await this.consumer.disconnect();
  }
}
