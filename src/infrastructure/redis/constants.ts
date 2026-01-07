export const REDIS_CLIENT = 'REDIS_CLIENT';

export const SessionCacheKeys = {
  USER_SESSION: (userId: string) => `user:session:${userId}`,
  REFRESH_TOKEN: (tokenHash: string) => `user:refresh-token:${tokenHash}`,
  REVOKED_TOKEN: (tokenHash: string) => `user:revoked-token:${tokenHash}`,
  TOKEN_FAMILY: (family: string) => `user:token-family:${family}`,
  USER_TOKENS: (userId: string) => `user:tokens:${userId}`,
};
