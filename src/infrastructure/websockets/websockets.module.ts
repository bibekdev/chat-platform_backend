import { Global, Module } from '@nestjs/common';

import { ConversationsModule } from '@/modules/conversations/conversations.module';
import { FriendsModule } from '@/modules/friends/friends.module';
import { MessagesModule } from '@/modules/messages/messages.module';
import { RedisModule } from '../redis/redis.module';
import { WebsocketsGateway } from './websockets.gateway';
import { WebsocketsService } from './websockets.service';

@Global()
@Module({
  imports: [RedisModule, MessagesModule, ConversationsModule, FriendsModule],
  providers: [WebsocketsService, WebsocketsGateway],
  exports: [WebsocketsService, WebsocketsGateway],
})
export class WebsocketsModule {}
