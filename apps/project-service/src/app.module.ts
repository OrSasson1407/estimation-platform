import { Module } from '@nestjs/common';
import { ProjectService } from './project-service.service';
import { ProjectController } from './project-service.controller';

@Module({
  imports: [],
  controllers: [ProjectController],
  providers: [ProjectService],
})
export class AppModule {}
