import { Socket } from 'socket.io';

import { AuthenticatedUser } from '@/modules/auth/types';
import { PublicUser } from '../database/types';

export interface AuthenticatedSocket extends Socket {
  user: AuthenticatedUser;
}

export const WEBSOCKET_EVENTS = {
  // Connection Events
  CONNECTION: 'connection',
  DISCONNECT: 'disconnect',

  // Presence Events (server -> client)
  USER_ONLINE: 'userOnline',
  USER_OFFLINE: 'userOffline',
  PRESENCE_UPDATED: 'presenceUpdated',
  ONLINE_FRIENDS: 'onlineFriends',

  // Error event
  ERROR: 'error',
} as const;

export type WebsocketEvent = (typeof WEBSOCKET_EVENTS)[keyof typeof WEBSOCKET_EVENTS];

export interface UserOnlinePayload {
  userId: string;
  user: PublicUser;
}

export interface ErrorPayload {
  event: string;
  message: string;
  code?: string;
}

export interface JoinConversationPayload {
  conversationId: string;
}

export interface LeaveConversationPayload {
  conversationId: string;
}

export interface SendMessagePayload {
  conversationId: string;
  content?: string;
  type?: 'text' | 'image' | 'file' | 'audio' | 'video';
  replyToId?: string;
  attachments?: {
    fileName: string;
    fileUrl: string;
    fileType: string;
    fileSize: number;
    duration?: number;
    thumbnailUrl?: string;
    blurHash?: string;
  }[];
}

export interface TypingPayload {
  conversationId: string;
}

export interface EditMessagePayload {
  conversationId: string;
  messageId: string;
  content: string;
}

export interface DeleteMessagePayload {
  conversationId: string;
  messageId: string;
  forEveryone?: boolean;
}

export const getRoomName = {
  conversation: (conversationId: string) => `conversation:${conversationId}`,
  user: (userId: string) => `user:${userId}`,
} as const;
