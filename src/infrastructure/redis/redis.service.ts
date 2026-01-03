import { Inject, Injectable, Logger, OnModuleDestroy } from '@nestjs/common';
import Redis from 'ioredis';

import { REDIS_CLIENT } from './constants';

@Injectable()
export class RedisService implements OnModuleDestroy {
  private readonly logger = new Logger(RedisService.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redis: Redis) {}

  async onModuleDestroy() {
    await this.redis.quit();
  }

  // ============================================================================
  // BASIC OPERATIONS
  // ============================================================================

  /**
   * Get a value by key
   */
  async get(key: string): Promise<string | null> {
    try {
      return await this.redis.get(key);
    } catch (error) {
      this.logger.error(`Redis GET error for key ${key}:`, error);
      return null;
    }
  }

  /**
   * Set a value with optional TTL (in seconds)
   */
  async set(key: string, value: string, ttlSeconds?: number): Promise<boolean> {
    try {
      if (ttlSeconds) {
        await this.redis.setex(key, ttlSeconds, value);
      } else {
        await this.redis.set(key, value);
      }
      return true;
    } catch (error) {
      this.logger.error(`Redis SET error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Delete a key
   */
  async del(key: string): Promise<boolean> {
    try {
      await this.redis.del(key);
      return true;
    } catch (error) {
      this.logger.error(`Redis DEL error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Delete multiple keys by pattern
   */
  async delByPattern(pattern: string): Promise<number> {
    try {
      const keys = await this.redis.keys(pattern);
      if (keys.length === 0) return 0;

      const pipeline = this.redis.pipeline();
      keys.forEach(key => pipeline.del(key));
      await pipeline.exec();

      return keys.length;
    } catch (error) {
      this.logger.error(`Redis DEL pattern error for ${pattern}:`, error);
      return 0;
    }
  }

  /**
   * Check if key exists
   */
  async exists(key: string): Promise<boolean> {
    try {
      const result = await this.redis.exists(key);
      return result === 1;
    } catch (error) {
      this.logger.error(`Redis EXISTS error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Set expiration on a key
   */
  async expire(key: string, ttlSeconds: number): Promise<boolean> {
    try {
      await this.redis.expire(key, ttlSeconds);
      return true;
    } catch (error) {
      this.logger.error(`Redis EXPIRE error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Get TTL of a key
   */
  async ttl(key: string): Promise<number> {
    try {
      return await this.redis.ttl(key);
    } catch (error) {
      this.logger.error(`Redis TTL error for key ${key}:`, error);
      return -1;
    }
  }

  // ============================================================================
  // JSON OPERATIONS
  // ============================================================================

  /**
   * Get and parse JSON value
   */
  async getJson<T>(key: string): Promise<T | null> {
    try {
      const value = await this.get(key);
      if (!value) return null;
      return JSON.parse(value) as T;
    } catch (error) {
      this.logger.error(`Redis GET JSON error for key ${key}:`, error);
      return null;
    }
  }

  /**
   * Set JSON value with optional TTL
   */
  async setJson<T>(key: string, value: T, ttlSeconds?: number): Promise<boolean> {
    try {
      const serialized = JSON.stringify(value);
      return await this.set(key, serialized, ttlSeconds);
    } catch (error) {
      this.logger.error(`Redis SET JSON error for key ${key}:`, error);
      return false;
    }
  }

  // ============================================================================
  // SET OPERATIONS (for token families, user sessions)
  // ============================================================================

  /**
   * Add member to a set
   */
  async sadd(key: string, ...members: string[]): Promise<number> {
    try {
      return await this.redis.sadd(key, ...members);
    } catch (error) {
      this.logger.error(`Redis SADD error for key ${key}:`, error);
      return 0;
    }
  }

  /**
   * Remove member from a set
   */
  async srem(key: string, ...members: string[]): Promise<number> {
    try {
      return await this.redis.srem(key, ...members);
    } catch (error) {
      this.logger.error(`Redis SREM error for key ${key}:`, error);
      return 0;
    }
  }

  /**
   * Check if member exists in set
   */
  async sismember(key: string, member: string): Promise<boolean> {
    try {
      const result = await this.redis.sismember(key, member);
      return result === 1;
    } catch (error) {
      this.logger.error(`Redis SISMEMBER error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Get all members of a set
   */
  async smembers(key: string): Promise<string[]> {
    try {
      return await this.redis.smembers(key);
    } catch (error) {
      this.logger.error(`Redis SMEMBERS error for key ${key}:`, error);
      return [];
    }
  }

  // ============================================================================
  // HASH OPERATIONS (for structured session data)
  // ============================================================================

  /**
   * Set hash field
   */
  async hset(key: string, field: string, value: string): Promise<boolean> {
    try {
      await this.redis.hset(key, field, value);
      return true;
    } catch (error) {
      this.logger.error(`Redis HSET error for key ${key}:`, error);
      return false;
    }
  }

  /**
   * Get hash field
   */
  async hget(key: string, field: string): Promise<string | null> {
    try {
      return await this.redis.hget(key, field);
    } catch (error) {
      this.logger.error(`Redis HGET error for key ${key}:`, error);
      return null;
    }
  }

  /**
   * Get all hash fields
   */
  async hgetall(key: string): Promise<Record<string, string>> {
    try {
      return await this.redis.hgetall(key);
    } catch (error) {
      this.logger.error(`Redis HGETALL error for key ${key}:`, error);
      return {};
    }
  }

  /**
   * Delete hash field
   */
  async hdel(key: string, ...fields: string[]): Promise<number> {
    try {
      return await this.redis.hdel(key, ...fields);
    } catch (error) {
      this.logger.error(`Redis HDEL error for key ${key}:`, error);
      return 0;
    }
  }

  // ============================================================================
  // UTILITY
  // ============================================================================

  /**
   * Check if Redis is connected
   */
  isConnected(): boolean {
    return this.redis.status === 'ready';
  }

  /**
   * Ping Redis
   */
  async ping(): Promise<boolean> {
    try {
      const result = await this.redis.ping();
      return result === 'PONG';
    } catch {
      return false;
    }
  }
}
