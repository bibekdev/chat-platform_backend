import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

import { SessionCacheKeys } from './constants';
import { RedisService } from './redis.service';
import { CachedUserRefreshToken, CachedUserSession } from './types';

@Injectable()
export class SessionCacheService {
  private readonly logger = new Logger(SessionCacheService.name);

  private readonly userSessionTTL: number;
  private readonly refreshTokenTTL: number;

  constructor(
    private readonly redisService: RedisService,
    private readonly configService: ConfigService
  ) {
    this.userSessionTTL = this.parseExpiresIn(
      this.configService.getOrThrow('JWT_ACCESS_EXPIRES_IN')
    );

    this.refreshTokenTTL = this.parseExpiresIn(
      this.configService.getOrThrow('JWT_REFRESH_EXPIRES_IN')
    );
  }

  async cacheUserSession(userId: string, userData: CachedUserSession): Promise<void> {
    const key = SessionCacheKeys.USER_SESSION(userId);
    const ttl = this.userSessionTTL;

    const success = await this.redisService.setJson(key, userData, ttl);
    if (success) {
      this.logger.log(`User session cached successfully for user ${userId}`);
    }
  }

  async getUserSession(userId: string): Promise<CachedUserSession | null> {
    const key = SessionCacheKeys.USER_SESSION(userId);
    return this.redisService.getJson<CachedUserSession>(key);
  }

  async invalidateUserSession(userId: string): Promise<void> {
    const key = SessionCacheKeys.USER_SESSION(userId);
    await this.redisService.del(key);
    this.logger.log(`User session invalidated successfully for user ${userId}`);
  }

  async cacheRefreshToken(tokenData: CachedUserRefreshToken, ttlSeconds: number) {
    const key = SessionCacheKeys.REFRESH_TOKEN(tokenData.tokenHash);

    await this.redisService.setJson(key, tokenData, ttlSeconds);

    await this.addTokenToUserSet(tokenData.userId, tokenData.tokenHash);

    await this.addTokenToFamilySet(tokenData.family, tokenData.tokenHash);

    this.logger.log(
      `Refresh token cached successfully for token ${tokenData.tokenHash.substring(0, 8)}...`
    );
  }

  async getCachedRefreshToken(tokenHash: string): Promise<CachedUserRefreshToken | null> {
    const key = SessionCacheKeys.REFRESH_TOKEN(tokenHash);
    return this.redisService.getJson<CachedUserRefreshToken>(key);
  }

  async removeCachedRefreshToken(tokenHash: string): Promise<void> {
    const key = SessionCacheKeys.REFRESH_TOKEN(tokenHash);
    const tokenData = await this.getCachedRefreshToken(tokenHash);

    await this.redisService.del(key);

    if (tokenData) {
      await this.removeTokenFromUserSet(tokenData.userId, tokenHash);
      await this.removeTokenFromFamilySet(tokenData.family, tokenHash);
    }

    this.logger.debug(
      `Refresh token removed successfully for token ${tokenHash.substring(0, 8)}...`
    );
  }

  async markTokenAsRevoked(tokenHash: string): Promise<void> {
    const tokenKey = SessionCacheKeys.REFRESH_TOKEN(tokenHash);
    const revokedKey = SessionCacheKeys.REVOKED_TOKEN(tokenHash);
    const ttl = this.refreshTokenTTL;

    // Get token data before removing it
    const tokenData = await this.getCachedRefreshToken(tokenHash);

    // Add to revoked tokens set (separate key to track revocations)
    await this.redisService.set(revokedKey, '1', ttl);

    // Remove the cached token data
    await this.redisService.del(tokenKey);

    // Clean up user and family sets if we had token data
    if (tokenData) {
      await this.removeTokenFromUserSet(tokenData.userId, tokenHash);
      await this.removeTokenFromFamilySet(tokenData.family, tokenHash);
    }

    this.logger.log(`Token ${tokenHash.substring(0, 8)}... marked as revoked`);
  }

  async isTokenRevoked(tokenHash: string): Promise<boolean> {
    const revokedKey = SessionCacheKeys.REVOKED_TOKEN(tokenHash);
    return this.redisService.exists(revokedKey);
  }

  private async addTokenToFamilySet(family: string, tokenHash: string): Promise<void> {
    const key = SessionCacheKeys.TOKEN_FAMILY(family);
    await this.redisService.sadd(key, tokenHash);
    await this.redisService.expire(key, this.refreshTokenTTL);
  }

  private async removeTokenFromFamilySet(family: string, tokenHash: string): Promise<void> {
    const key = SessionCacheKeys.TOKEN_FAMILY(family);
    await this.redisService.srem(key, tokenHash);
  }

  async revokeTokenFamily(family: string): Promise<string[]> {
    const key = SessionCacheKeys.TOKEN_FAMILY(family);
    const tokenHashes = await this.redisService.smembers(key);

    // Mark all tokens as revoked
    for (const tokenHash of tokenHashes) {
      await this.markTokenAsRevoked(tokenHash);
    }

    await this.redisService.del(key);

    this.logger.warn(`Revoked ${tokenHashes.length} tokens for family ${family}`);
    return tokenHashes;
  }

  private async addTokenToUserSet(userId: string, tokenHash: string): Promise<void> {
    const key = SessionCacheKeys.USER_TOKENS(userId);
    await this.redisService.sadd(key, tokenHash);
    await this.redisService.expire(key, this.refreshTokenTTL);
  }

  private async removeTokenFromUserSet(userId: string, tokenHash: string): Promise<void> {
    const key = SessionCacheKeys.USER_TOKENS(userId);
    await this.redisService.srem(key, tokenHash);
  }

  async revokeAllUserTokens(userId: string): Promise<string[]> {
    const key = SessionCacheKeys.USER_TOKENS(userId);
    const tokenHashes = await this.redisService.smembers(key);

    // Mark all tokens as revoked
    for (const tokenHash of tokenHashes) {
      await this.markTokenAsRevoked(tokenHash);
    }

    await this.redisService.del(key);
    await this.invalidateUserSession(userId);

    this.logger.warn(`Revoked ${tokenHashes.length} tokens for user ${userId}`);
    return tokenHashes;
  }

  async getUserTokenHashes(userId: string): Promise<string[]> {
    const key = SessionCacheKeys.USER_TOKENS(userId);
    return this.redisService.smembers(key);
  }

  private parseExpiresIn(expiresIn: string): number {
    const match = expiresIn.match(/^(\d+)([smhd])$/);
    if (!match) return 1800; // Default 30 minutes

    const value = parseInt(match[1], 10);
    const unit = match[2];

    switch (unit) {
      case 's':
        return value;
      case 'm':
        return value * 60;
      case 'h':
        return value * 3600;
      case 'd':
        return value * 86400;
      default:
        return 1800; // Default 30 minutes
    }
  }
}
