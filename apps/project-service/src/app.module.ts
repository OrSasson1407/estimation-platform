// apps/project-service/src/app.module.ts  ← PHASE 1 UPGRADE
import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { ProjectController } from './project-service.controller';
import { ProjectService } from './project-service.service';
import { SprintService } from './sprint.service';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: process.env.JWT_PUBLIC_KEY || 'dev-secret',
    }),
  ],
  controllers: [ProjectController],
  providers: [ProjectService, SprintService, JwtStrategy],
})
export class AppModule {}
