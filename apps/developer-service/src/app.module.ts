import { Module } from '@nestjs/common';
import { DeveloperController } from './developer-service.controller';
import { DeveloperService } from './developer-service.service';

@Module({
  imports: [],
  controllers: [DeveloperController],
  providers: [DeveloperService],
})
export class AppModule {}
