import * as dotenv from 'dotenv'; import * as path from 'path'; dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  app.enableCors({
    origin: process.env.FRONTEND_URL || 'http://localhost:3000',
    credentials: true,
  });
  const port = process.env.PORT_AUTH_SERVICE || process.env.PORT || 3001;
  await app.listen(port);
  console.log(`Auth Service running on port ${port}`);
}
bootstrap();


