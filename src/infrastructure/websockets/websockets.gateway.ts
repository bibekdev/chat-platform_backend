import { Logger } from '@nestjs/common';
import {
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  WebSocketGateway,
  WebSocketServer,
} from '@nestjs/websockets';
import { Server } from 'socket.io';

import { FriendsService } from '@/modules/friends/friends.service';
import { PublicUser } from '../database/types';
import { SocketCacheService } from '../redis/socket-cache.service';
import {
  AuthenticatedSocket,
  ErrorPayload,
  getRoomName,
  UserOnlinePayload,
  WEBSOCKET_EVENTS,
} from './types';
import { WebsocketsService } from './websockets.service';

@WebSocketGateway({
  cors: {
    origin: '*',
    credentials: true,
  },
})
export class WebsocketsGateway implements OnGatewayInit, OnGatewayConnection, OnGatewayDisconnect {
  private readonly logger = new Logger(WebsocketsGateway.name);

  constructor(
    private readonly websocketsService: WebsocketsService,
    private readonly socketCacheService: SocketCacheService,
    private readonly friendsService: FriendsService
  ) {}

  @WebSocketServer()
  server: Server;

  afterInit(server: Server) {
    this.websocketsService.setServer(server);
    this.logger.log('Websockets server initialized');
  }

  async handleConnection(client: AuthenticatedSocket) {
    try {
      const userId = client.user.id;
      const user = client.user;

      // Register socket and update presence
      await this.socketCacheService.addUserSocket(userId, client.id);

      // Join user's personal room for direct notifications
      client.join(getRoomName.user(userId));

      // Notify friends that user is online
      await this.notifyFriendsOfOnlineStatus(userId, user, true);
    } catch (error) {
      this.logger.error(`Connection error: ${error.message}`);
      client.disconnect();
    }
  }

  async handleDisconnect(client: AuthenticatedSocket) {
    try {
      const userId = client.user.id;
      if (!userId) return;

      const user = client.user;

      // Remove socket from cache
      await this.socketCacheService.removeUserSocket(userId, client.id);

      // Check if user still has other active connections
      const isStillOnline = await this.socketCacheService.isUserOnline(userId);
      if (!isStillOnline) {
        // Notify friends that user is offline
        await this.notifyFriendsOfOnlineStatus(userId, user, false);
      }

      this.logger.log(`Client disconnected: ${client.id} (User: ${userId})`);
    } catch (error) {
      this.logger.error(`Disconnect error: ${error.message}`);
    }
  }

  private async notifyFriendsOfOnlineStatus(userId: string, user: PublicUser, isOnline: boolean) {
    try {
      // Get user's friends
      const friendsResult = await this.friendsService.getFriends(userId, {
        limit: 100,
        direction: 'desc',
      });
      const friendIds = friendsResult.data.map(friend => friend.friendId);

      if (friendIds.length === 0) return;

      if (isOnline) {
        const onlinePayload: UserOnlinePayload = {
          userId,
          user,
        };
        this.websocketsService.sendToUsers(friendIds, WEBSOCKET_EVENTS.USER_ONLINE, onlinePayload);
      }
    } catch (error) {
      this.logger.error(`Failed to notify friends of presence update: ${error.message}`);
    }
  }

  /*
   * Handle Errors and send error response to client
   */
  private handleError(
    client: AuthenticatedSocket,
    event: string,
    error: Error
  ): { success: false; error: string } {
    this.logger.error(`Error in ${event}: ${error.message}`);

    const errorPayload: ErrorPayload = {
      event,
      message: error.message,
    };

    client.emit(WEBSOCKET_EVENTS.ERROR, errorPayload);
    return {
      success: false,
      error: error.message,
    };
  }
}
