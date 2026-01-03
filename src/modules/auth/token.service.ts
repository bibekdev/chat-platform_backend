import crypto from 'node:crypto';
import { Inject, Injectable, Logger } from '@nestjs/common';
import { and, desc, eq, gt, lt } from 'drizzle-orm';

import { generateUniqueId } from '@/common/lib/utils';
import { DATABASE_CONNECTION } from '@/infrastructure/database/constants';
import { refreshTokens } from '@/infrastructure/database/schemas';
import { DrizzleDB, RefreshToken } from '@/infrastructure/database/types';
import { SessionCacheService } from '@/infrastructure/redis/session-cache.service';

@Injectable()
export class TokenService {
  private readonly logger = new Logger(TokenService.name);

  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: DrizzleDB,
    private readonly sessionCacheService: SessionCacheService
  ) {}

  hashToken(token: string): string {
    return crypto.createHash('sha256').update(token).digest('hex');
  }

  generateSecureToken(): string {
    return crypto.randomBytes(32).toString('hex');
  }

  generateFamily(): string {
    return crypto.randomUUID();
  }

  async createRefreshToken(data: {
    userId: string;
    token: string;
    family: string;
    expiresAt: Date;
    userAgent?: string;
    ipAddress?: string;
  }): Promise<RefreshToken> {
    const tokenHash = this.hashToken(data.token);

    const newToken: RefreshToken = {
      tokenHash,
      isRevoked: false,
      createdAt: new Date(),
      id: generateUniqueId('refresh-token'),
      userAgent: data.userAgent ?? null,
      ipAddress: data.ipAddress ?? null,
      userId: data.userId,
      family: data.family,
      expiresAt: data.expiresAt,
    };

    const [createdToken] = await this.db.insert(refreshTokens).values(newToken).returning();

    // Cache the token for fast lookups

    const ttlSeconds = Math.floor((data.expiresAt.getTime() - Date.now()) / 1000);
    await this.sessionCacheService.cacheRefreshToken(
      {
        id: createdToken.id,
        userId: data.userId,
        family: data.family,
        expiresAt: data.expiresAt.toISOString(),
        isRevoked: createdToken.isRevoked,
        tokenHash,
      },
      ttlSeconds
    );

    return createdToken;
  }

  async findByTokenHash(tokenHash: string): Promise<RefreshToken | null> {
    const isRevoked = await this.sessionCacheService.isTokenRevoked(tokenHash);
    if (isRevoked) {
      this.logger.debug(`Token revoked (cache hit): ${tokenHash.substring(0, 8)}...`);
      return null;
    }

    // Check cache for token data
    const cachedToken = await this.sessionCacheService.getCachedRefreshToken(tokenHash);
    if (cachedToken) {
      if (cachedToken.isRevoked) {
        return null;
      }

      const expiresAt = new Date(cachedToken.expiresAt);
      if (expiresAt < new Date()) {
        await this.sessionCacheService.removeCachedRefreshToken(tokenHash);
        return null;
      }

      this.logger.debug(`Token cache hit: ${tokenHash.substring(0, 8)}...`);
    }

    const [token] = await this.db
      .select()
      .from(refreshTokens)
      .where(
        and(
          eq(refreshTokens.tokenHash, tokenHash),
          eq(refreshTokens.isRevoked, false),
          gt(refreshTokens.expiresAt, new Date())
        )
      )
      .limit(1);

    if (token && !cachedToken) {
      const ttlSeconds = Math.floor((token.expiresAt.getTime() - Date.now()) / 1000);
      if (ttlSeconds > 0) {
        await this.sessionCacheService.cacheRefreshToken(
          {
            tokenHash,
            id: token.id,
            userId: token.userId,
            family: token.family,
            expiresAt: token.expiresAt.toISOString(),
            isRevoked: false,
          },
          ttlSeconds
        );
      }
    }
    return token;
  }

  async findByToken(token: string): Promise<RefreshToken | null> {
    const tokenHash = this.hashToken(token);
    return this.findByTokenHash(tokenHash);
  }

  async revokeToken(tokenId: string): Promise<void> {
    const [token] = await this.db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.id, tokenId))
      .limit(1);

    // Update database
    await this.db
      .update(refreshTokens)
      .set({ isRevoked: true })
      .where(eq(refreshTokens.id, tokenId));

    if (token) {
      await this.sessionCacheService.markTokenAsRevoked(token.tokenHash);
    }

    this.logger.debug(`Revoked token: ${tokenId}`);
  }

  /*
   * Revoke all tokens in a family (used when token reuse is detected)
   * This is a security measure to invalidate potentially compromised tokens
   */
  async revokeTokenFamily(family: string): Promise<void> {
    await this.db
      .update(refreshTokens)
      .set({ isRevoked: true })
      .where(eq(refreshTokens.family, family));

    await this.sessionCacheService.revokeTokenFamily(family);

    this.logger.warn(`Revoked token family: ${family}`);
  }

  /**
   * Revoke all refresh tokens for a user (used on logout from all devices)
   */
  async revokeAllUserTokens(userId: string): Promise<void> {
    // Update database
    await this.db
      .update(refreshTokens)
      .set({ isRevoked: true })
      .where(eq(refreshTokens.userId, userId));

    // Revoke in cache (also invalidates user session)
    await this.sessionCacheService.revokeAllUserTokens(userId);

    this.logger.log(`Revoked all tokens for user: ${userId}`);
  }

  async cleanupExpiredTokens(): Promise<number> {
    const result = await this.db
      .delete(refreshTokens)
      .where(lt(refreshTokens.expiresAt, new Date()));

    return result.rowCount ?? 0;
  }

  async getUserSession(userId: string): Promise<RefreshToken[]> {
    return this.db
      .select()
      .from(refreshTokens)
      .where(eq(refreshTokens.userId, userId))
      .orderBy(desc(refreshTokens.createdAt));
  }

  async getUserSessionCountFromCache(userId: string): Promise<number> {
    const tokenHashes = await this.sessionCacheService.getUserTokenHashes(userId);
    return tokenHashes.length;
  }
}
