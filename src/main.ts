import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';

import { AppModule } from './app.module';

async function bootstrap() {
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  await app.listen(configService.getOrThrow<number>('PORT'));
}

bootstrap().catch(error => {
  console.error(error);
  process.exit(1);
});
