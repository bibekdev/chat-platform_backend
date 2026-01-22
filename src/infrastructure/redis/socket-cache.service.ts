import { Injectable, Logger } from '@nestjs/common';

import { SocketCacheKeys } from './constants';
import { RedisService } from './redis.service';
import { UserPresence } from './types';

@Injectable()
export class SocketCacheService {
  private readonly logger = new Logger(SocketCacheService.name);

  constructor(private readonly redisService: RedisService) {}

  // ============================================================================
  // CONNECTION MANAGEMENT
  // ============================================================================

  /*
   * Register a new socket connection for a user
   * A user can have multiple sockets (multiple tabs/devices)
   */
  async addUserSocket(userId: string, socketId: string): Promise<void> {
    const userSocketsKey = SocketCacheKeys.USER_SOCKETS(userId);
    const socketUserKey = SocketCacheKeys.SOCKET_USER(socketId);

    // Add socket to user's set of sockets
    await this.redisService.sadd(userSocketsKey, socketId);

    // Map socket ID -> user ID for reverse lookup
    await this.redisService.set(socketUserKey, userId);

    // Add user to online users set
    await this.redisService.sadd(SocketCacheKeys.ONLINE_USERS, userId);

    // Update presence
    await this.updatePresence(userId, 'online');

    this.logger.debug(`Socket ${socketId} registered for user ${userId}`);
  }

  /*
   * Remove a socket connection for a user
   */
  async removeUserSocket(userId: string, socketId: string): Promise<void> {
    const userSocketsKey = SocketCacheKeys.USER_SOCKETS(userId);
    const socketUserKey = SocketCacheKeys.SOCKET_USER(socketId);

    // Remove socket from user's set
    await this.redisService.srem(userSocketsKey, socketId);

    // Remove socket -> user mapping
    await this.redisService.del(socketUserKey);

    // Check if user has any remaining sockets
    const remainingSockets = await this.getUserSocketIds(userId);

    if (remainingSockets.length === 0) {
      // User has no more active connections
      await this.redisService.srem(SocketCacheKeys.ONLINE_USERS, userId);
      await this.updatePresence(userId, 'offline');
      this.logger.debug(`User ${userId} is now offline (no active sockets)`);
    }

    this.logger.debug(`Socket ${socketId} removed for user ${userId}`);
  }

  /*
   * Remove all sockets for a user (e.g., on logout)
   */
  async removeAllUserSockets(userId: string): Promise<string[]> {
    const socketIds = await this.getUserSocketIds(userId);

    // Remove all socket -> user mappings
    for (const socketId of socketIds) {
      const socketUserKey = SocketCacheKeys.SOCKET_USER(socketId);
      await this.redisService.del(socketUserKey);
    }

    // Remove user's socket set
    const userSocketsKey = SocketCacheKeys.USER_SOCKETS(userId);
    await this.redisService.del(userSocketsKey);

    // Remove from online users
    await this.redisService.srem(SocketCacheKeys.ONLINE_USERS, userId);

    // Update presence
    await this.updatePresence(userId, 'offline');

    this.logger.log(`Removed all ${socketIds.length} sockets for user ${userId}`);

    return socketIds;
  }

  // ============================================================================
  // SOCKET LOOKUPS
  // ============================================================================

  /*
   * Get all socket IDs for a user
   */
  async getUserSocketIds(userId: string): Promise<string[]> {
    const key = SocketCacheKeys.USER_SOCKETS(userId);
    return this.redisService.smembers(key);
  }

  /*
   * Get user ID from socket ID
   */
  async getUserIdBySocketId(socketId: string): Promise<string | null> {
    const key = SocketCacheKeys.SOCKET_USER(socketId);
    return this.redisService.get(key);
  }

  /*
   * Check if a user has any active sockets
   */
  async isUserConnected(userId: string): Promise<boolean> {
    const sockets = await this.getUserSocketIds(userId);
    return sockets.length > 0;
  }

  /*
   * Get the number of active sockets for a user
   */
  async getUserSocketCount(userId: string): Promise<number> {
    const sockets = await this.getUserSocketIds(userId);
    return sockets.length;
  }

  // ============================================================================
  // ONLINE STATUS
  // ============================================================================

  /*
   * Get all online user IDs
   */
  async getOnlineUserIds(): Promise<string[]> {
    return this.redisService.smembers(SocketCacheKeys.ONLINE_USERS);
  }

  /*
   * Check if a user is online
   */
  async isUserOnline(userId: string): Promise<boolean> {
    return this.redisService.sismember(SocketCacheKeys.ONLINE_USERS, userId);
  }

  /*
   * Get online status for multiple users
   */
  async getOnlineStatusBatch(userIds: string[]): Promise<Map<string, boolean>> {
    const result = new Map<string, boolean>();

    // Check each user's online status
    const checks = await Promise.all(userIds.map(id => this.isUserOnline(id)));

    userIds.forEach((id, index) => {
      result.set(id, checks[index]);
    });

    return result;
  }

  /*
   * Get count of online users
   */
  async getOnlineUserCount(): Promise<number> {
    const users = await this.getOnlineUserIds();
    return users.length;
  }

  // ============================================================================
  // PRESENCE MANAGEMENT
  // ============================================================================

  /*
   * Update user's presence status
   */
  async updatePresence(
    userId: string,
    status: 'online' | 'away' | 'busy' | 'offline'
  ): Promise<void> {
    const key = SocketCacheKeys.USER_PRESENCE(userId);

    const presence: UserPresence = {
      userId,
      status,
      lastSeen: Date.now(),
    };

    // Keep presence data for 24 hours (useful for "last seen" feature)
    await this.redisService.setJson(key, presence, 86400);
  }

  /*
   * Get user's presence
   */
  async getPresence(userId: string): Promise<UserPresence | null> {
    const key = SocketCacheKeys.USER_PRESENCE(userId);
    return this.redisService.getJson<UserPresence>(key);
  }

  /*
   * Get presence for multiple users
   */
  async getPresenceBatch(userIds: string[]): Promise<Map<string, UserPresence | null>> {
    const result = new Map<string, UserPresence | null>();

    const presences = await Promise.all(userIds.map(id => this.getPresence(id)));

    userIds.forEach((id, index) => {
      result.set(id, presences[index]);
    });

    return result;
  }

  /*
   * Set user as away (can be called by client or after inactivity timeout)
   */
  async setUserAway(userId: string): Promise<void> {
    const isOnline = await this.isUserOnline(userId);
    if (isOnline) {
      await this.updatePresence(userId, 'away');
    }
  }

  /*
   * Set user as busy (do not disturb)
   */
  async setUserBusy(userId: string): Promise<void> {
    const isOnline = await this.isUserOnline(userId);
    if (isOnline) {
      await this.updatePresence(userId, 'busy');
    }
  }

  /*
   * Set user back to online
   */
  async setUserOnline(userId: string): Promise<void> {
    const isOnline = await this.isUserOnline(userId);
    if (isOnline) {
      await this.updatePresence(userId, 'online');
    }
  }

  // ============================================================================
  // MULTI-USER SOCKET LOOKUPS
  // ============================================================================

  /*
   * Get socket IDs for multiple users (useful for broadcasting)
   */
  async getSocketIdsForUsers(userIds: string[]): Promise<Map<string, string[]>> {
    const result = new Map<string, string[]>();

    const socketLists = await Promise.all(userIds.map(id => this.getUserSocketIds(id)));

    userIds.forEach((id, index) => {
      result.set(id, socketLists[index]);
    });

    return result;
  }

  /*
   * Get all socket IDs for multiple users (flattened)
   */
  async getAllSocketIdsForUsers(userIds: string[]): Promise<string[]> {
    const socketMap = await this.getSocketIdsForUsers(userIds);
    const allSockets: string[] = [];

    socketMap.forEach(sockets => {
      allSockets.push(...sockets);
    });

    return allSockets;
  }

  /*
   * Get online users from a list (useful for showing online friends)
   */
  async filterOnlineUsers(userIds: string[]): Promise<string[]> {
    const statusMap = await this.getOnlineStatusBatch(userIds);
    return userIds.filter(id => statusMap.get(id) === true);
  }
}
