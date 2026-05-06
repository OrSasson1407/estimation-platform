// apps/developer-service/src/app.module.ts  ← UPDATED: Prisma provider
import { Module } from '@nestjs/common';
import { DeveloperController } from './developer-service.controller';
import { DeveloperService } from './developer-service.service';

@Module({
  controllers: [DeveloperController],
  providers: [DeveloperService],
})
export class AppModule {}
