import { Module } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { AuthController } from './auth-service.controller';
import { AuthService } from './auth-service.service';

@Module({
  imports: [
    JwtModule.register({
      // In production, these should be RS256 PEM keys injected via Vault
      secret: process.env.JWT_PRIVATE_KEY || 'dev-secret-do-not-use',
      signOptions: {
        expiresIn: '1h',
        algorithm: 'HS256', // Swap to RS256 when Vault PEMs are configured
      },
    }),
  ],
  controllers: [AuthController],
  providers: [AuthService],
})
export class AppModule {}
