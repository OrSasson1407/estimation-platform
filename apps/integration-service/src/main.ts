import * as dotenv from 'dotenv'; import * as path from 'path'; dotenv.config({ path: path.resolve(__dirname, '../../../.env') });
import { NestFactory } from '@nestjs/core';
import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule, { rawBody: true });
  const port = process.env.PORT_INTEGRATION_SERVICE || process.env.PORT || 3005;
  await app.listen(port);
  console.log(`Integration Service running on port ${port}`);
}
bootstrap();


