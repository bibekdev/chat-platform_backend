import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { validateEnv } from './config/env.config';
import { DatabaseModule } from './infrastructure/database/database.module';
import { RedisModule } from './infrastructure/redis/redis.module';
import { AuthModule } from './modules/auth/auth.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      envFilePath: ['.env', '.env.local', '.env.prod'],
    }),

    // Infrastructure
    DatabaseModule,
    RedisModule,

    // Modules
    AuthModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
