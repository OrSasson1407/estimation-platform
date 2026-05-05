import { Module } from '@nestjs/common';
import { IntegrationController } from './integration-service.controller';

@Module({
  controllers: [IntegrationController],
})
export class AppModule {}
