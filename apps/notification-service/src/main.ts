import * as dotenv from 'dotenv'; import * as path from 'path'; dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = process.env.PORT_NOTIFICATION_SERVICE || process.env.PORT || 3008;
  await app.listen(port);
  console.log(`Notification Service running on port ${port}`);
}
bootstrap();


