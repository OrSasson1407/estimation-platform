import { NestFactory } from "@nestjs/core";
import { AppModule } from "./app.module";

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  // All our backend APIs will be prefixed with /api/v1 as per the spec
  app.setGlobalPrefix("api/v1");
  await app.listen(process.env.PORT_PROJECT_SERVICE || 3001);
  console.log(`Project Service is running on: ${await app.getUrl()}`);
}
bootstrap();
