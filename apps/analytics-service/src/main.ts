import * as dotenv from 'dotenv'; import * as path from 'path'; dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.enableCors({ origin: process.env.FRONTEND_URL || 'http://localhost:3000' });
  const port = process.env.PORT_ANALYTICS_SERVICE || process.env.PORT || 3007;
  await app.listen(port);
  console.log(`Analytics Service running on port ${port}`);
}
bootstrap();


