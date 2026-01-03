export type CachedUserSession = {
  id: string;
  email: string;
  name: string;
  avatar: string | undefined;
  cachedAt: number;
};

export type CachedUserRefreshToken = {
  id: string;
  userId: string;
  family: string;
  tokenHash: string;
  expiresAt: string;
  isRevoked: boolean;
};
