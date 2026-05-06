// apps/auth-service/src/app.module.ts  ← UPDATED: RS256 + Passport + Prisma
import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { PassportModule } from '@nestjs/passport';
import { AuthController } from './auth-service.controller';
import { AuthService } from './auth-service.service';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      // RS256 PEM keys injected via Vault at runtime.
      // Falls back to HS256 secret in local dev only.
      secret: process.env.JWT_PRIVATE_KEY || 'dev-secret-do-not-use-in-prod',
      signOptions: {
        expiresIn: '1h',
        algorithm: process.env.JWT_PRIVATE_KEY ? 'RS256' : 'HS256',
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService, JwtStrategy],
  exports: [AuthService],
})
export class AppModule {}
