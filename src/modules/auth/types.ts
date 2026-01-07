import { Request } from 'express';

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

/**
 * Authenticated user data available in request context.
 * This is the minimal user data needed for authorization.
 */
export interface AuthenticatedUser {
  id: string;
  email: string;
  name: string;
  avatar?: string;
}

export interface AuthenticatedRequest extends Request {
  user: AuthenticatedUser | null;
}
