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
import { CallsService } from '@/modules/calls/calls.service';
import { ConversationsService } from '@/modules/conversations/conversations.service';
import { FriendsService } from '@/modules/friends/friends.service';
import { MessagesService } from '@/modules/messages/messages.service';
import { PublicUser } from '../database/types';
import { SocketCacheService } from '../redis/socket-cache.service';
import {
  AuthenticatedSocket,
  CALL_EVENTS,
  CallAcceptPayload,
  CallAnswerPayload,
  CallEndPayload,
  CallIceCandidatePayload,
  CallInitiatePayload,
  CallOfferPayload,
  CallRejectPayload,
  DeleteMessagePayload,
  EditMessagePayload,
  ErrorPayload,
  getRoomName,
  JoinConversationPayload,
  LeaveConversationPayload,
  MarkReadPayload,
  ReactionPayload,
  SendMessagePayload,
  TypingPayload,
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
    private readonly messagesService: MessagesService,
    private readonly callService: CallsService
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
        // Clean up active calls
        await this.handleCallDisconnect(userId, user);

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

  @SubscribeMessage(CONVERSATION_EVENTS.EDIT_MESSAGE)
  async handleEditMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: EditMessagePayload
  ) {
    const { conversationId, messageId, content } = payload;
    const userId = client.user.id;

    try {
      const message = await this.messagesService.editMessage(conversationId, messageId, userId, {
        content,
      });
      const event = {
        conversationId,
        data: message,
      };

      client
        .to(getRoomName.conversation(conversationId))
        .emit(CONVERSATION_EVENTS.MESSAGE_UPDATED, event);

      const memberIds = await this.conversationsService.getConversationMemberIds(conversationId);
      const recipientIds = memberIds.filter(id => id !== userId);
      this.websocketsService.sendToUsers(recipientIds, CONVERSATION_EVENTS.MESSAGE_UPDATED, event);

      return { success: true, data: message };
    } catch (error) {
      return this.handleError(client, CONVERSATION_EVENTS.EDIT_MESSAGE, error);
    }
  }

  @SubscribeMessage(CONVERSATION_EVENTS.DELETE_MESSAGE)
  async handleDeleteMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: DeleteMessagePayload
  ) {
    const { conversationId, messageId, forEveryone } = payload;
    const userId = client.user.id;

    try {
      await this.messagesService.deleteMessage(conversationId, messageId, userId, forEveryone);

      if (forEveryone) {
        const event = {
          conversationId,
          messageId,
          deletedForEveryone: true,
        };

        client
          .to(getRoomName.conversation(conversationId))
          .emit(CONVERSATION_EVENTS.MESSAGE_DELETED, event);

        const memberIds = await this.conversationsService.getConversationMemberIds(conversationId);
        const recipientIds = memberIds.filter(id => id !== userId);
        this.websocketsService.sendToUsers(
          recipientIds,
          CONVERSATION_EVENTS.MESSAGE_DELETED,
          event
        );
      }

      return { success: true };
    } catch (error) {
      return this.handleError(client, CONVERSATION_EVENTS.DELETE_MESSAGE, error);
    }
  }

  @SubscribeMessage(CONVERSATION_EVENTS.TYPING_START)
  handleTypingStart(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: TypingPayload
  ) {
    const { conversationId } = payload;
    const user = client.user;

    const event = {
      conversationId,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
      },
      isTyping: true,
    };

    client
      .to(getRoomName.conversation(conversationId))
      .emit(CONVERSATION_EVENTS.USER_TYPING, event);

    return { success: true };
  }

  @SubscribeMessage(CONVERSATION_EVENTS.TYPING_STOP)
  handleStopTyping(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: TypingPayload
  ) {
    const { conversationId } = payload;
    const user = client.user;

    const event = {
      conversationId,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar,
      },
      isTyping: false,
    };

    client
      .to(getRoomName.conversation(conversationId))
      .emit(CONVERSATION_EVENTS.USER_TYPING, event);

    return { success: true };
  }

  @SubscribeMessage(CONVERSATION_EVENTS.MARK_READ)
  async handleMarkRead(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: MarkReadPayload
  ) {
    const { conversationId, messageId } = payload;
    const userId = client.user.id;

    try {
      await this.messagesService.markMessageAsRead(conversationId, messageId, userId);

      const event = {
        conversationId,
        messageId,
        userId,
        readAt: new Date(),
      };

      client
        .to(getRoomName.conversation(conversationId))
        .emit(CONVERSATION_EVENTS.MESSAGE_READ, event);

      return { success: true };
    } catch (error) {
      return this.handleError(client, CONVERSATION_EVENTS.MESSAGE_READ, error);
    }
  }

  @SubscribeMessage(CONVERSATION_EVENTS.ADD_REACTION)
  async handleAddReaction(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: ReactionPayload
  ) {
    const { conversationId, messageId, reaction } = payload;
    const userId = client.user.id;

    try {
      await this.messagesService.addReaction(conversationId, messageId, userId, reaction);

      // Fetch updated message with all reactions
      const message = await this.messagesService.getMessageWithDetails(messageId, userId);

      const event = {
        conversationId,
        message,
      };

      client
        .to(getRoomName.conversation(conversationId))
        .emit(CONVERSATION_EVENTS.MESSAGE_UPDATED, event);

      return { success: true, data: message };
    } catch (error) {
      return this.handleError(client, CONVERSATION_EVENTS.ADD_REACTION, error);
    }
  }

  @SubscribeMessage(CONVERSATION_EVENTS.REMOVE_REACTION)
  async handleRemoveReaction(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: ReactionPayload
  ) {
    const { conversationId, messageId, reaction } = payload;
    const userId = client.user.id;

    try {
      await this.messagesService.removeReaction(conversationId, messageId, userId, reaction);

      const message = await this.messagesService.getMessageWithDetails(messageId, userId);

      const event = {
        conversationId,
        message,
      };

      client
        .to(getRoomName.conversation(conversationId))
        .emit(CONVERSATION_EVENTS.MESSAGE_UPDATED, event);

      return { success: true, data: message };
    } catch (error) {
      return this.handleError(client, CONVERSATION_EVENTS.REMOVE_REACTION, error);
    }
  }

  @SubscribeMessage(CALL_EVENTS.CALL_INITIATE)
  async handleCallInititate(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: CallInitiatePayload
  ) {
    const { conversationId, mediaType = 'audio' } = payload;
    const user = client.user;

    try {
      const isMember = await this.conversationsService.isConversationMember(
        conversationId,
        user.id
      );
      if (!isMember) {
        throw new WsException('You are not a member of this conversation');
      }

      const conversation = await this.conversationsService.findConversationById(conversationId);
      const isGroup = conversation?.type === 'group';

      const call = await this.callService.createCall({
        conversationId,
        initiatorId: user.id,
        isGroup: isGroup ?? false,
        mediaType,
      });

      this.websocketsService.joinRoom(client.id, getRoomName.call(call.id));

      const memberIds = await this.conversationsService.getConversationMemberIds(conversationId);
      const recipientIds = memberIds.filter(id => id !== user.id);

      this.websocketsService.sendToUsers(recipientIds, CALL_EVENTS.CALL_INCOMING, {
        callId: call.id,
        conversationId,
        caller: { id: user.id, name: user.name, email: user.email, avatar: user.avatar ?? '' },
        conversationName: conversation?.name ?? null,
        isGroup: isGroup ?? false,
        participants: call.participants,
        mediaType: call.mediaType,
      });

      return { success: true, data: call };
    } catch (error) {
      this.logger.error(`Error initiating call: ${error}`);
      return this.handleError(client, CALL_EVENTS.CALL_INITIATE, error);
    }
  }

  @SubscribeMessage(CALL_EVENTS.CALL_ACCEPT)
  async handleCallAccept(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: CallAcceptPayload
  ) {
    const { callId } = payload;
    const user = client.user;

    try {
      const call = await this.callService.joinCall(callId, user.id);
      if (!call) {
        throw new WsException('Call not found');
      }

      // Join the call room
      this.websocketsService.joinRoom(client.id, getRoomName.call(callId));

      // Notify other participants that a new user joined
      client.to(getRoomName.call(callId)).emit(CALL_EVENTS.CALL_PARTICIPANT_JOINED, {
        callId,
        userId: user.id,
        user: { id: user.id, name: user.name, email: user.email, avatar: user.avatar ?? '' },
      });

      return { success: true, data: call };
    } catch (error) {
      this.logger.error(`Error accepting call: ${error}`);
      return this.handleError(client, CALL_EVENTS.CALL_ACCEPT, error);
    }
  }

  @SubscribeMessage(CALL_EVENTS.CALL_REJECT)
  async handleCallReject(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: CallRejectPayload
  ) {
    const { callId } = payload;
    const user = client.user;

    try {
      const call = await this.callService.getCall(callId);
      if (!call) {
        throw new WsException('Call not found');
      }

      if (!call.isGroup && call.participants.length <= 1) {
        const conversationId = call.conversationId;
        await this.callService.endCall(callId);

        const endedPayload = { callId, reason: 'rejected' as const };
        // Notify anyone in the call room (the initiator)
        this.websocketsService.sendToRoom(
          getRoomName.call(callId),
          CALL_EVENTS.CALL_ENDED,
          endedPayload
        );

        // Also notify via user rooms for the initiator in case they left the call room
        const memberIds = await this.conversationsService.getConversationMemberIds(conversationId);
        const recipientIds = memberIds.filter(id => id !== user.id);
        this.websocketsService.sendToUsers(recipientIds, CALL_EVENTS.CALL_ENDED, endedPayload);
      }

      return { success: true };
    } catch (error) {
      this.logger.error(`Error rejecting call: ${error}`);
      return this.handleError(client, CALL_EVENTS.CALL_REJECT, error);
    }
  }

  @SubscribeMessage(CALL_EVENTS.CALL_OFFER)
  handleCallOffer(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: CallOfferPayload
  ) {
    const { callId, targetUserId, sdp } = payload;
    const userId = client.user.id;

    try {
      this.websocketsService.sendToUser(targetUserId, CALL_EVENTS.CALL_OFFER, {
        callId,
        fromUserId: userId,
        sdp,
      });
      return { success: true };
    } catch (error) {
      this.logger.error(`Error relaying call offer: ${error}`);
      return this.handleError(client, CALL_EVENTS.CALL_OFFER, error);
    }
  }

  @SubscribeMessage(CALL_EVENTS.CALL_ANSWER)
  handleCallAnswer(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: CallAnswerPayload
  ) {
    const { callId, targetUserId, sdp } = payload;
    const userId = client.user.id;

    try {
      this.websocketsService.sendToUser(targetUserId, CALL_EVENTS.CALL_ANSWER, {
        callId,
        fromUserId: userId,
        sdp,
      });
      return { success: true };
    } catch (error) {
      this.logger.error(`Error relaying call answer: ${error}`);
      return this.handleError(client, CALL_EVENTS.CALL_ANSWER, error);
    }
  }

  @SubscribeMessage(CALL_EVENTS.CALL_ICE_CANDIDATE)
  handleCallIceCandidate(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: CallIceCandidatePayload
  ) {
    const { callId, targetUserId, candidate } = payload;
    const userId = client.user.id;

    try {
      this.websocketsService.sendToUser(targetUserId, CALL_EVENTS.CALL_ICE_CANDIDATE, {
        callId,
        fromUserId: userId,
        candidate,
      });
      return { success: true };
    } catch (error) {
      this.logger.error(`Error relaying ICE candidate: ${error}`);
      return this.handleError(client, CALL_EVENTS.CALL_ICE_CANDIDATE, error);
    }
  }

  @SubscribeMessage(CALL_EVENTS.CALL_END)
  async handleCallEnd(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: CallEndPayload
  ) {
    const { callId } = payload;
    const user = client.user;

    try {
      // Fetch call data before leaving so we have conversationId for notifications
      const callBeforeLeave = await this.callService.getCall(callId);
      if (!callBeforeLeave) {
        return { success: true };
      }
      const remaining = await this.callService.leaveCall(callId, user.id);

      this.websocketsService.leaveRoom(client.id, getRoomName.call(callId));

      const endedPayload = { callId, reason: 'ended' as const };

      if (!remaining) {
        // Notify via call room (for anyone who accepted and is in it)
        this.websocketsService.sendToRoom(
          getRoomName.call(callId),
          CALL_EVENTS.CALL_ENDED,
          endedPayload
        );

        // Also notify all conversation members via user rooms so callees
        // who haven't accepted yet (and thus aren't in the call room) get notified
        const memberIds = await this.conversationsService.getConversationMemberIds(
          callBeforeLeave.conversationId
        );
        const recipientIds = memberIds.filter(id => id !== user.id);
        this.websocketsService.sendToUsers(recipientIds, CALL_EVENTS.CALL_ENDED, endedPayload);
      } else {
        client.to(getRoomName.call(callId)).emit(CALL_EVENTS.CALL_PARTICIPANT_LEFT, {
          callId,
          userId: user.id,
          user: { id: user.id, name: user.name, email: user.email, avatar: user.avatar ?? '' },
        });

        if (!remaining.isGroup) {
          await this.callService.endCall(callId);
          this.websocketsService.sendToRoom(
            getRoomName.call(callId),
            CALL_EVENTS.CALL_ENDED,
            endedPayload
          );

          const memberIds = await this.conversationsService.getConversationMemberIds(
            remaining.conversationId
          );
          const recipientIds = memberIds.filter(id => id !== user.id);
          this.websocketsService.sendToUsers(recipientIds, CALL_EVENTS.CALL_ENDED, endedPayload);
        }
      }
      return { success: true };
    } catch (error) {
      this.logger.error(`Error ending call: ${error}`);
      return this.handleError(client, CALL_EVENTS.CALL_END, error);
    }
  }

  private async handleCallDisconnect(userId: string, user: PublicUser) {
    try {
      // Get call data before removal so we have conversationId
      const activeCallId = await this.callService.getUserActiveCallId(userId);
      if (!activeCallId) return;
      const callBeforeLeave = await this.callService.getCall(activeCallId);

      const result = await this.callService.removeUserFromAllCalls(userId);
      if (!result) return;

      const { callId, remaining } = result;
      const endedPayload = { callId, reason: 'ended' as const };

      if (!remaining) {
        this.websocketsService.sendToRoom(
          getRoomName.call(callId),
          CALL_EVENTS.CALL_ENDED,
          endedPayload
        );

        if (callBeforeLeave) {
          const memberIds = await this.conversationsService.getConversationMemberIds(
            callBeforeLeave.conversationId
          );
          const recipientIds = memberIds.filter(id => id !== userId);
          this.websocketsService.sendToUsers(recipientIds, CALL_EVENTS.CALL_ENDED, endedPayload);
        }
      } else {
        this.websocketsService.sendToRoom(
          getRoomName.call(callId),
          CALL_EVENTS.CALL_PARTICIPANT_LEFT,
          {
            callId,
            userId,
            user: { id: user.id, name: user.name, email: user.email, avatar: user.avatar ?? '' },
          }
        );

        if (!remaining.isGroup) {
          await this.callService.endCall(callId);
          this.websocketsService.sendToRoom(
            getRoomName.call(callId),
            CALL_EVENTS.CALL_ENDED,
            endedPayload
          );

          const memberIds = await this.conversationsService.getConversationMemberIds(
            remaining.conversationId
          );
          const recipientIds = memberIds.filter(id => id !== userId);
          this.websocketsService.sendToUsers(recipientIds, CALL_EVENTS.CALL_ENDED, endedPayload);
        }
      }
    } catch (error) {
      this.logger.error(`Error handling call disconnect for user ${userId}: ${error.message}`);
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
