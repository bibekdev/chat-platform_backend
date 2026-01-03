import { Request } from 'express';

import { User } from '@/infrastructure/database/types';

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

export interface JwtPayload {
  sub: string; // User ID
  email: string;
  type: 'access' | 'refresh';
  family?: string; // For refresh token rotation
  iat?: number;
  exp?: number;
}

export interface RefreshTokenPayload extends JwtPayload {
  type: 'refresh';
  family: string;
  tokenId: string;
}

export interface AuthenticatedRequest extends Request {
  user: Omit<User, 'password'> | null;
}
