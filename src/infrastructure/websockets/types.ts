import { Socket } from 'socket.io';

import { AuthenticatedUser } from '@/modules/auth/types';

export interface AuthenticatedSocket extends Socket {
  user: AuthenticatedUser;
}

export const WEBSOCKETS_EVENTS = {
  // Friends related events
  GET_ONLINE_USERS: 'getOnlineUsers',

  // Chat related events
} as const;

export type WebsocketsEvents = (typeof WEBSOCKETS_EVENTS)[keyof typeof WEBSOCKETS_EVENTS];
