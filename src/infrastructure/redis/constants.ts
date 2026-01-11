export const REDIS_CLIENT = 'REDIS_CLIENT';

export const SessionCacheKeys = {
  USER_SESSION: (userId: string) => `user:session:${userId}`,
  REFRESH_TOKEN: (tokenHash: string) => `user:refresh-token:${tokenHash}`,
  REVOKED_TOKEN: (tokenHash: string) => `user:revoked-token:${tokenHash}`,
  TOKEN_FAMILY: (family: string) => `user:token-family:${family}`,
  USER_TOKENS: (userId: string) => `user:tokens:${userId}`,
};

export const SocketCacheKeys = {
  /** Set of socket IDs for a user (supports multiple connections) */
  USER_SOCKETS: (userId: string) => `socket:user:${userId}`,
  /** Maps socket ID to user ID */
  SOCKET_USER: (socketId: string) => `socket:id:${socketId}`,
  /** Set of all online user IDs */
  ONLINE_USERS: 'socket:online-users',
  /** User's online status with metadata */
  USER_PRESENCE: (userId: string) => `socket:presence:${userId}`,
};
