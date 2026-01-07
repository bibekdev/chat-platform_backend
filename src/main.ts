import { Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { NestFactory } from '@nestjs/core';
import { NextFunction, Request, Response } from 'express';
import helmet from 'helmet';

import { AppModule } from './app.module';
import { GlobalZodValidationPipe } from './common/pipes/global-zod-validation.pipe';
import { corsConfig } from './config/cors.config';
import { helmetSecurityConfigOptions } from './config/helmet.config';

async function bootstrap() {
  const logger = new Logger('Bootstrap');
  const app = await NestFactory.create(AppModule);
  const configService = app.get(ConfigService);

  app.enableCors(corsConfig);
  app.use(helmet(helmetSecurityConfigOptions));

  app.use((req: Request, res: Response, next: NextFunction) => {
    res.removeHeader('X-Powered-By');

    res.setHeader('X-API-Version', '1.0');
    res.setHeader('Cache-Control', 'no-store, no-cache, must-revalidate, proxy-revalidate');
    res.setHeader('Pragma', 'no-cache');
    res.setHeader('Expires', '0');
    res.setHeader('Surrogate-Control', 'no-store');

    next();
  });

  app.setGlobalPrefix('api/v1');
  app.useGlobalPipes(new GlobalZodValidationPipe());

  /*
   * Graceful shutdown
   */
  app.enableShutdownHooks();

  process.on('SIGTERM', async () => {
    logger.log('SIGTERM signal received. Starting graceful shutdown...');
    await app.close();
    process.exit(0);
  });

  process.on('SIGINT', async () => {
    logger.log('SIGINT signal received. Starting graceful shutdown...');
    await app.close();
    process.exit(0);
  });

  const port = configService.getOrThrow<number>('PORT');
  const host = configService.getOrThrow<string>('HOST');

  await app.listen(port, host);

  logger.log(`🚀 Application is running on: http://${host}:${port}`);
  logger.log(`📡 WebSocket server is ready`);
}

bootstrap().catch(error => {
  console.error(error);
  process.exit(1);
});
