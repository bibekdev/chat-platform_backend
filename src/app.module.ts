import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';

import { validateEnv } from './config/env.config';
import { DatabaseModule } from './infrastructure/database/database.module';
import { RedisModule } from './infrastructure/redis/redis.module';
import { WebsocketsModule } from './infrastructure/websockets/websockets.module';
import { AuthModule } from './modules/auth/auth.module';
import { FriendsModule } from './modules/friends/friends.module';
import { MessagesModule } from './modules/messages/messages.module';
import { UsersModule } from './modules/users/users.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
      validate: validateEnv,
      envFilePath: ['.env'],
    }),

    // Infrastructure
    DatabaseModule,
    RedisModule,

    // Modules
    AuthModule,
    UsersModule,
    FriendsModule,
    WebsocketsModule,
    MessagesModule,
  ],
  controllers: [],
  providers: [],
})
export class AppModule {}
