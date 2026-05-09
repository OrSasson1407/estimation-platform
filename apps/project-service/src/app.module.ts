// apps/project-service/src/app.module.ts
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
      // RS256 public key loaded at runtime; falls back to symmetric secret in dev
      secret: process.env.JWT_PUBLIC_KEY || 'dev-secret',
      verifyOptions: {
        algorithms: process.env.JWT_PUBLIC_KEY ? ['RS256'] : ['HS256'],
      },
    }),
  ],
  controllers: [ProjectController],
  providers: [ProjectService, SprintService, JwtStrategy],
})
export class AppModule {}