import { Logger } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayConnection,
  OnGatewayDisconnect,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import { Server } from 'socket.io';

import { CONVERSATION_EVENTS } from '@/common/types';
import { ConversationsService } from '@/modules/conversations/conversations.service';
import { FriendsService } from '@/modules/friends/friends.service';
import { MessagesService } from '@/modules/messages/messages.service';
import { PublicUser } from '../database/types';
import { SocketCacheService } from '../redis/socket-cache.service';
import {
  AuthenticatedSocket,
  ErrorPayload,
  getRoomName,
  JoinConversationPayload,
  LeaveConversationPayload,
  SendMessagePayload,
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
    private readonly friendsService: FriendsService,
    private readonly conversationsService: ConversationsService,
    private readonly messagesService: MessagesService
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

  @SubscribeMessage(CONVERSATION_EVENTS.JOIN_CONVERSATION)
  async handleJoinConversation(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: JoinConversationPayload
  ) {
    const { conversationId } = payload;
    const userId = client.user.id;

    try {
      const isMember = await this.conversationsService.isConversationMember(conversationId, userId);
      if (!isMember) {
        throw new WsException('You are not a member of this conversation');
      }

      this.websocketsService.joinRoom(client.id, getRoomName.conversation(conversationId));
      return { success: true, conversationId };
    } catch (error) {
      return this.handleError(client, CONVERSATION_EVENTS.JOIN_CONVERSATION, error);
    }
  }

  @SubscribeMessage(CONVERSATION_EVENTS.LEAVE_CONVERSATION)
  async handleLeaveConversation(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: LeaveConversationPayload
  ) {
    const { conversationId } = payload;
    const userId = client.user.id;

    try {
      const isMember = await this.conversationsService.isConversationMember(conversationId, userId);
      if (!isMember) {
        throw new WsException('You are not a member of this conversation');
      }

      this.websocketsService.leaveRoom(client.id, getRoomName.conversation(conversationId));
      return { success: true, conversationId };
    } catch (error) {
      return this.handleError(client, CONVERSATION_EVENTS.LEAVE_CONVERSATION, error);
    }
  }

  @SubscribeMessage(CONVERSATION_EVENTS.SEND_MESSAGE)
  async handleSendMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: SendMessagePayload
  ) {
    const { conversationId, ...messageData } = payload;
    const userId = client.user.id;

    try {
      const message = await this.messagesService.sendMessage(conversationId, userId, {
        content: messageData.content,
        type: messageData.type ?? 'text',
        replyToId: messageData.replyToId,
        attachments: messageData.attachments,
      });

      const event = {
        conversationId,
        message,
      };

      // Broadcas to conversation room, excluding sender
      client
        .to(getRoomName.conversation(conversationId))
        .emit(CONVERSATION_EVENTS.NEW_MESSAGE, event);

      // Also notify sender with the new message (in case they want to update optimistic UI)
      const memberIds = await this.conversationsService.getConversationMemberIds(conversationId);
      const recipientIds = memberIds.filter(id => id !== userId);
      this.websocketsService.sendToUsers(recipientIds, CONVERSATION_EVENTS.NEW_MESSAGE, event);

      return { success: true, data: message };
    } catch (error) {
      return this.handleError(client, CONVERSATION_EVENTS.SEND_MESSAGE, error);
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
