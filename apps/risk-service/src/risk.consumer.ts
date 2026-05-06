// apps/risk-service/src/risk.consumer.ts  ← NEW: Kafka consumer
import { Injectable, OnModuleInit, OnModuleDestroy } from '@nestjs/common';
import { Kafka, Consumer, EachMessagePayload } from 'kafkajs';
import { RiskService } from './risk-service';
import { createLogger } from '@estimation/logger';
import { KAFKA_TOPICS } from '@estimation/events';

const logger = createLogger('risk-consumer');

@Injectable()
export class RiskConsumer implements OnModuleInit, OnModuleDestroy {
  private consumer: Consumer;

  constructor(private readonly riskService: RiskService) {
    const kafka = new Kafka({ brokers: [process.env.KAFKA_BROKER || 'localhost:9092'] });
    this.consumer = kafka.consumer({ groupId: 'risk-service.consumer-group' });
  }

  async onModuleInit() {
    await this.consumer.connect();

    await this.consumer.subscribe({
      topics: [
        KAFKA_TOPICS.TASK_STATUS_CHANGED,
        KAFKA_TOPICS.ESTIMATE_GENERATED,
        KAFKA_TOPICS.CONFIDENCE_LOW,
        KAFKA_TOPICS.VELOCITY_UPDATED,
        KAFKA_TOPICS.SPRINT_COMPLETED,
      ],
      fromBeginning: false,
    });

    await this.consumer.run({
      eachMessage: async ({ topic, message }: EachMessagePayload) => {
        if (!message.value) return;

        try {
          const event = JSON.parse(message.value.toString());

          if (
            topic === KAFKA_TOPICS.ESTIMATE_GENERATED ||
            topic === KAFKA_TOPICS.CONFIDENCE_LOW ||
            topic === KAFKA_TOPICS.TASK_STATUS_CHANGED
          ) {
            await this.riskService.evaluateTaskEvent(event);
          }

          if (topic === KAFKA_TOPICS.VELOCITY_UPDATED) {
            await this.riskService.evaluateDeveloperEvent(event);
          }
        } catch (err) {
          logger.error({ topic, err }, 'risk_consumer_error');
        }
      },
    });

    logger.info('Risk Kafka consumer started');
  }

  async onModuleDestroy() {
    await this.consumer.disconnect();
  }
}
