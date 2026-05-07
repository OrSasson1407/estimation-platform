// apps/notification-service/src/app.module.ts  ← PHASE 1 UPGRADE
import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { NotificationController } from './notification-service.controller';
import { NotificationService } from './notification-service.service';
import { NotificationConsumer } from './notification.consumer';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: process.env.JWT_PUBLIC_KEY || 'dev-secret',
    }),
  ],
  controllers: [NotificationController],
  providers: [NotificationService, NotificationConsumer, JwtStrategy],
})
export class AppModule {}
