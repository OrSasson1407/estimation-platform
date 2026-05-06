// apps/analytics-service/src/app.module.ts  ← NEW
import { Module } from '@nestjs/common';
import { AnalyticsController } from './analytics-service.controller';
import { AnalyticsService } from './analytics-service.service';
import { AnalyticsConsumer } from './analytics.consumer';

@Module({
  controllers: [AnalyticsController],
  providers: [AnalyticsService, AnalyticsConsumer],
})
export class AppModule {}
