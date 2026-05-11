import * as dotenv from 'dotenv'; import * as path from 'path'; dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const port = process.env.PORT_COLLABORATION_SERVICE || process.env.PORT || 3004;
  await app.listen(port);
  console.log(`Collaboration Service running on port ${port}`);
}
bootstrap();


