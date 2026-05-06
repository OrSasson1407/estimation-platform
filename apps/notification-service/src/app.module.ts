// apps/notification-service/src/app.module.ts  ← NEW
import { Module } from '@nestjs/common';
import { NotificationService } from './notification-service.service';
import { NotificationConsumer } from './notification.consumer';
import { NotificationController } from './notification-service.controller';

@Module({
  controllers: [NotificationController],
  providers: [NotificationService, NotificationConsumer],
})
export class AppModule {}
