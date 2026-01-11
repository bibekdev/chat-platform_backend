import { Injectable, Logger } from '@nestjs/common';
import { Server } from 'socket.io';

import { SocketCacheService } from '../redis/socket-cache.service';

@Injectable()
export class WebsocketsService {
  private readonly logger = new Logger(WebsocketsService.name);
  private server: Server | null = null;

  constructor(private readonly socketCacheService: SocketCacheService) {}

  /**
   * Set the Socket.IO server instance (called from gateway)
   */
  setServer(server: Server): void {
    this.server = server;
    this.logger.log('Socket.IO server instance set');
  }

  /**
   * Get the Socket.IO server instance
   */
  getServer(): Server | null {
    return this.server;
  }

  // ============================================================================
  // SEND TO USERS
  // ============================================================================

  /**
   * Send event to a specific user (all their connected devices)
   */
  sendToUser<T>(userId: string, event: string, data: T): void {
    if (!this.server) {
      this.logger.warn('Server not initialized, cannot send to user');
      return;
    }

    // Use the user's room (joined on connection)
    this.server.to(`user:${userId}`).emit(event, data);
  }

  /**
   * Send event to multiple users
   */
  sendToUsers<T>(userIds: string[], event: string, data: T): void {
    if (!this.server) {
      this.logger.warn('Server not initialized, cannot send to users');
      return;
    }

    const rooms = userIds.map(id => `user:${id}`);
    this.server.to(rooms).emit(event, data);
  }

  /**
   * Send event to all online users
   */
  broadcast<T>(event: string, data: T): void {
    if (!this.server) {
      this.logger.warn('Server not initialized, cannot broadcast');
      return;
    }

    this.server.emit(event, data);
  }

  /**
   * Send event to a specific socket
   */
  sendToSocket<T>(socketId: string, event: string, data: T): void {
    if (!this.server) {
      this.logger.warn('Server not initialized, cannot send to socket');
      return;
    }

    this.server.to(socketId).emit(event, data);
  }

  // ============================================================================
  // ROOM MANAGEMENT
  // ============================================================================

  /**
   * Add a socket to a room
   */
  joinRoom(socketId: string, room: string): void {
    if (!this.server) return;

    const socket = this.server.sockets.sockets.get(socketId);
    if (socket) {
      socket.join(room);
    }
  }

  /**
   * Remove a socket from a room
   */
  leaveRoom(socketId: string, room: string): void {
    if (!this.server) return;

    const socket = this.server.sockets.sockets.get(socketId);
    if (socket) {
      socket.leave(room);
    }
  }

  /**
   * Send event to a room
   */
  sendToRoom<T>(room: string, event: string, data: T): void {
    if (!this.server) {
      this.logger.warn('Server not initialized, cannot send to room');
      return;
    }

    this.server.to(room).emit(event, data);
  }

  // ============================================================================
  // ONLINE STATUS
  // ============================================================================

  /**
   * Get online users from a list (e.g., friends)
   */
  async getOnlineUsers(userIds: string[]): Promise<string[]> {
    return this.socketCacheService.filterOnlineUsers(userIds);
  }

  /**
   * Check if a user is online
   */
  async isUserOnline(userId: string): Promise<boolean> {
    return this.socketCacheService.isUserOnline(userId);
  }

  /**
   * Get all online user IDs
   */
  async getAllOnlineUsers(): Promise<string[]> {
    return this.socketCacheService.getOnlineUserIds();
  }

  /**
   * Get online status for multiple users
   */
  async getOnlineStatusBatch(userIds: string[]): Promise<Map<string, boolean>> {
    return this.socketCacheService.getOnlineStatusBatch(userIds);
  }

  // ============================================================================
  // PRESENCE
  // ============================================================================

  /**
   * Update user presence status
   */
  async updatePresence(
    userId: string,
    status: 'online' | 'away' | 'busy' | 'offline'
  ): Promise<void> {
    await this.socketCacheService.updatePresence(userId, status);
  }

  /**
   * Get user presence
   */
  async getPresence(userId: string) {
    return this.socketCacheService.getPresence(userId);
  }

  /**
   * Get presence for multiple users
   */
  async getPresenceBatch(userIds: string[]) {
    return this.socketCacheService.getPresenceBatch(userIds);
  }

  // ============================================================================
  // SOCKET LOOKUPS
  // ============================================================================

  /**
   * Get all socket IDs for a user
   */
  async getUserSockets(userId: string): Promise<string[]> {
    return this.socketCacheService.getUserSocketIds(userId);
  }

  /**
   * Get user ID from socket ID
   */
  async getUserBySocket(socketId: string): Promise<string | null> {
    return this.socketCacheService.getUserIdBySocketId(socketId);
  }

  /**
   * Disconnect all sockets for a user (e.g., on logout)
   */
  async disconnectUser(userId: string): Promise<void> {
    if (!this.server) return;

    const socketIds = await this.socketCacheService.removeAllUserSockets(userId);

    for (const socketId of socketIds) {
      const socket = this.server.sockets.sockets.get(socketId);
      if (socket) {
        socket.disconnect(true);
      }
    }

    this.logger.log(`Disconnected ${socketIds.length} sockets for user ${userId}`);
  }
}
