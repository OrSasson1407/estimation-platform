// apps/notification-service/src/notification-service.controller.ts  ← PHASE 1 UPGRADE
import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { NotificationService, NotificationPayload } from './notification-service.service';

@Controller('api/v1/notifications')
@UseGuards(AuthGuard('jwt'))
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  // Internal endpoint: allows other services to directly trigger a notification
  @Post('send')
  send(@Body() payload: NotificationPayload) {
    return this.notificationService.dispatch(payload);
  }
}
