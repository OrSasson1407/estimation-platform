// apps/risk-service/src/app.module.ts  ← PHASE 1 UPGRADE
import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { RiskController } from './risk.controller';
import { RiskService } from './risk-service';
import { RiskConsumer } from './risk.consumer';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: process.env.JWT_PUBLIC_KEY || 'dev-secret',
    }),
  ],
  controllers: [RiskController],
  providers: [RiskService, RiskConsumer, JwtStrategy],
})
export class AppModule {}
