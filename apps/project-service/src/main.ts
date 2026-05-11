import * as dotenv from 'dotenv'; import * as path from 'path'; dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
import { NestFactory } from '@nestjs/core';
import { ValidationPipe } from '@nestjs/common';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, transform: true }));
  const port = process.env.PORT_PROJECT_SERVICE || process.env.PORT || 3002;
  await app.listen(port);
  console.log(`Project Service running on port ${port}`);
}
bootstrap();


