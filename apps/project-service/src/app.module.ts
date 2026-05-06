// apps/project-service/src/app.module.ts  ← UPDATED: imports logger
import { Module } from '@nestjs/common';
import { ProjectController } from './project-service.controller';
import { ProjectService } from './project-service.service';

@Module({
  controllers: [ProjectController],
  providers: [ProjectService],
})
export class AppModule {}
