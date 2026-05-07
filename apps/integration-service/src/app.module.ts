// apps/integration-service/src/app.module.ts  ← PHASE 1 UPGRADE
import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { IntegrationController } from './integration-service.controller';
import { IntegrationService } from './integration-service.service';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: process.env.JWT_PUBLIC_KEY || 'dev-secret',
    }),
  ],
  controllers: [IntegrationController],
  providers: [IntegrationService, JwtStrategy],
})
export class AppModule {}
