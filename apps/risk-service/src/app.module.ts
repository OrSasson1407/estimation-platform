// apps/risk-service/src/app.module.ts  ← UPDATED
import { Module } from '@nestjs/common';
import { RiskController } from './risk.controller';
import { RiskService } from './risk-service';
import { RiskConsumer } from './risk.consumer';

@Module({
  controllers: [RiskController],
  providers: [RiskService, RiskConsumer],
})
export class AppModule {}
