// apps/integration-service/src/app.module.ts  ← UPDATED
import { Module } from '@nestjs/common';
import { IntegrationController } from './integration-service.controller';
import { IntegrationService } from './integration-service.service';

@Module({
  controllers: [IntegrationController],
  providers: [IntegrationService],
})
export class AppModule {}
