// apps/notification-service/src/notification-service.controller.ts  ← NEW
import { Controller, Post, Body, UseGuards } from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import { NotificationService } from './notification-service.service';

@Controller('api/v1/notifications')
@UseGuards(AuthGuard('jwt'))
export class NotificationController {
  constructor(private readonly notificationService: NotificationService) {}

  // Manual trigger endpoint — useful for testing and admin tools
  @Post('send')
  send(@Body() payload: any) {
    return this.notificationService.dispatch(payload);
  }
}
