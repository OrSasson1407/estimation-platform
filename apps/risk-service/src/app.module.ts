// apps/risk-service/src/app.module.ts
import { Module } from '@nestjs/common';
import { PassportModule } from '@nestjs/passport';
import { JwtModule } from '@nestjs/jwt';
import { RiskController } from './risk.controller';
import { RiskService } from './risk-service';
import { RiskConsumer } from './risk.consumer';
import { AnomalyDetector } from './anomaly.detector';
import { JwtStrategy } from './jwt.strategy';

@Module({
  imports: [
    PassportModule.register({ defaultStrategy: 'jwt' }),
    JwtModule.register({
      secret: process.env.JWT_PUBLIC_KEY || 'dev-secret',
      verifyOptions: {
        algorithms: process.env.JWT_PUBLIC_KEY ? ['RS256'] : ['HS256'],
      },
    }),
  ],
  controllers: [RiskController],
  providers: [RiskService, RiskConsumer, AnomalyDetector, JwtStrategy],
})
export class AppModule {}