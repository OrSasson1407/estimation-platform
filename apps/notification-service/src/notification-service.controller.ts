// apps/notification-service/src/notification-service.controller.ts
import {
  Controller,
  Get,
  Post,
  Put,
  Param,
  Body,
  Request,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthGuard } from '@nestjs/passport';
import {
  NotificationService,
  NotificationChannel,
  NotificationEventType,
} from './notification-service.service';
import { NotificationConsumer } from './notification.consumer';

@Controller('api/v1/notifications')
@UseGuards(AuthGuard('jwt'))
export class NotificationController {
  constructor(
    private readonly notificationService: NotificationService,
    private readonly notificationConsumer: NotificationConsumer,
  ) {}

  // ── User preferences ───────────────────────────────────────────────────────

  @Get('preferences')
  getMyPreferences(@Request() req: any) {
    return this.notificationService.getUserPreferences(req.user.userId);
  }

  @Put('preferences/:eventType')
  @HttpCode(HttpStatus.OK)
  setMyPreference(
    @Request() req: any,
    @Param('eventType') eventType: NotificationEventType,
    @Body('channels') channels: NotificationChannel[],
  ) {
    return this.notificationService.setUserPreferences(
      req.user.userId,
      eventType,
      channels,
    );
  }

  // ── Manual dispatch (admin / test) ─────────────────────────────────────────

  @Post('dispatch')
  @HttpCode(HttpStatus.OK)
  dispatchManual(@Body() body: any) {
    return this.notificationService.dispatch(body);
  }

  // ── Consumer health ────────────────────────────────────────────────────────

  @Get('health/consumer')
  getConsumerStats() {
    return this.notificationConsumer.getStats();
  }
}