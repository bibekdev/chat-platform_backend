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

export const CALL_EVENTS = {
  CALL_INITIATE: 'call:initiate',
  CALL_INCOMING: 'call:incoming',
  CALL_ACCEPT: 'call:accept',
  CALL_REJECT: 'call:reject',
  CALL_OFFER: 'call:offer',
  CALL_ANSWER: 'call:answer',
  CALL_ICE_CANDIDATE: 'call:ice-candidate',
  CALL_END: 'call:end',
  CALL_ENDED: 'call:ended',
  CALL_PARTICIPANT_JOINED: 'call:participant-joined',
  CALL_PARTICIPANT_LEFT: 'call:participant-left',
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

export interface MarkReadPayload {
  conversationId: string;
  messageId: string;
}

export interface ReactionPayload {
  conversationId: string;
  messageId: string;
  reaction: string;
}

// Call signaling payloads (client -> server)
export type CallMediaType = 'audio' | 'video';

export interface CallInitiatePayload {
  conversationId: string;
  mediaType?: CallMediaType;
}

export interface CallAcceptPayload {
  callId: string;
}

export interface CallRejectPayload {
  callId: string;
}

export interface CallOfferPayload {
  callId: string;
  targetUserId: string;
  sdp: RTCSessionDescriptionInit;
}

export interface CallAnswerPayload {
  callId: string;
  targetUserId: string;
  sdp: RTCSessionDescriptionInit;
}

export interface CallIceCandidatePayload {
  callId: string;
  targetUserId: string;
  candidate: RTCIceCandidateInit;
}

export interface CallEndPayload {
  callId: string;
}

// Call signaling events (server -> client)
export interface CallIncomingEvent {
  callId: string;
  conversationId: string;
  caller: PublicUser;
  conversationName: string | null;
  isGroup: boolean;
  participants: string[];
  mediaType: CallMediaType;
}

export interface CallAcceptedEvent {
  callId: string;
  userId: string;
  user: PublicUser;
}

export interface CallEndedEvent {
  callId: string;
  reason: 'ended' | 'rejected' | 'timeout' | 'error';
}

export interface CallParticipantEvent {
  callId: string;
  userId: string;
  user: PublicUser;
}

export interface CallOfferEvent {
  callId: string;
  fromUserId: string;
  sdp: RTCSessionDescriptionInit;
}

export interface CallAnswerEvent {
  callId: string;
  fromUserId: string;
  sdp: RTCSessionDescriptionInit;
}

export interface CallIceCandidateEvent {
  callId: string;
  fromUserId: string;
  candidate: RTCIceCandidateInit;
}

// Active call state stored in Redis
export interface ActiveCall {
  id: string;
  conversationId: string;
  initiatorId: string;
  participants: string[];
  startedAt: string;
  isGroup: boolean;
  mediaType: CallMediaType;
}

export const getRoomName = {
  conversation: (conversationId: string) => `conversation:${conversationId}`,
  user: (userId: string) => `user:${userId}`,
  call: (callId: string) => `call:${callId}`,
} as const;
