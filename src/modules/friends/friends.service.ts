import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, or } from 'drizzle-orm';

import {
  buildCursorCondition,
  createPaginatedResponse,
  getPaginationLimit,
  getSortDirection,
  PaginatedResponse,
  PaginationConfig,
} from '@/common/lib/pagination';
import { generateUniqueId } from '@/common/lib/utils';
import { DATABASE_CONNECTION } from '@/infrastructure/database/constants';
import { friendRequests, friends } from '@/infrastructure/database/schemas';
import { DrizzleDB, Friend, FriendRequest } from '@/infrastructure/database/types';

@Injectable()
export class FriendsService {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: DrizzleDB) {}

  async sendFriendRequest(senderId: string, receiverId: string): Promise<FriendRequest> {
    if (senderId === receiverId) {
      throw new BadRequestException('Cannot send friend request to yourself');
    }

    const isFriends = await this.isFriends(senderId, receiverId);
    if (isFriends) {
      throw new ConflictException('Users are already friends');
    }

    const existingRequest = await this.checkExistingFriendRequest(senderId, receiverId);
    if (existingRequest) {
      if (existingRequest.status === 'pending') {
        throw new ConflictException('Friend request already pending');
      }
      if (existingRequest.status === 'rejected') {
        throw new ConflictException('Friend request was previously rejected');
      }
    }

    const [result] = await this.db
      .insert(friendRequests)
      .values({
        id: generateUniqueId('frd_req'),
        senderId,
        receiverId,
        status: 'pending',
      })
      .returning();

    return result;
  }

  async acceptFriendRequest(requestId: string, userId: string): Promise<void> {
    const request = await this.getFriendRequestById(requestId);

    if (!request) {
      throw new NotFoundException('Friend request not found');
    }

    if (request.receiverId !== userId) {
      throw new ForbiddenException('You can only accept friend requests sent to you');
    }

    if (request.status !== 'pending') {
      throw new ConflictException(`Friend request is already ${request.status}`);
    }

    await this.db
      .update(friendRequests)
      .set({ status: 'accepted', updatedAt: new Date() })
      .where(eq(friendRequests.id, requestId));

    await this.db.insert(friends).values([
      {
        id: generateUniqueId('friend'),
        userId: request.senderId,
        friendId: request.receiverId,
      },
      {
        id: generateUniqueId('friend'),
        userId: request.receiverId,
        friendId: request.senderId,
      },
    ]);
  }

  async rejectFriendRequest(requestId: string, userId: string): Promise<void> {
    const request = await this.getFriendRequestById(requestId);

    if (!request) {
      throw new NotFoundException('Friend request not found');
    }

    if (request.receiverId !== userId) {
      throw new ForbiddenException('You can only reject friend requests sent to you');
    }

    if (request.status !== 'pending') {
      throw new ConflictException(`Friend request is already ${request.status}`);
    }

    await this.db
      .update(friendRequests)
      .set({ status: 'rejected', updatedAt: new Date() })
      .where(eq(friendRequests.id, requestId));
  }

  async cancelFriendRequest(requestId: string, userId: string): Promise<void> {
    const request = await this.getFriendRequestById(requestId);

    if (!request) {
      throw new NotFoundException('Friend request not found');
    }

    if (request.senderId !== userId) {
      throw new ForbiddenException('You can only cancel friend requests you sent');
    }

    if (request.status !== 'pending') {
      throw new ConflictException(
        `Cannot cancel a friend request that is already ${request.status}`
      );
    }

    await this.db.delete(friendRequests).where(eq(friendRequests.id, requestId));
  }

  async getIncomingFriendRequests(
    userId: string,
    pagination: PaginationConfig
  ): Promise<PaginatedResponse<FriendRequest>> {
    const sortDirection = getSortDirection(pagination.direction);
    const cursorCondition = buildCursorCondition(
      pagination,
      friendRequests.createdAt,
      friendRequests.id
    );

    const conditions = [
      eq(friendRequests.receiverId, userId),
      eq(friendRequests.status, 'pending'),
    ];
    if (cursorCondition) {
      conditions.push(cursorCondition);
    }

    const items = await this.db
      .select()
      .from(friendRequests)
      .where(and(...conditions))
      .orderBy(sortDirection(friendRequests.createdAt), sortDirection(friendRequests.id))
      .limit(getPaginationLimit(pagination));

    return createPaginatedResponse(
      items,
      pagination,
      item => item.createdAt,
      item => item.id
    );
  }

  async getOutgoingFriendRequests(
    userId: string,
    pagination: PaginationConfig
  ): Promise<PaginatedResponse<FriendRequest>> {
    const sortDirection = getSortDirection(pagination.direction);
    const cursorCondition = buildCursorCondition(
      pagination,
      friendRequests.createdAt,
      friendRequests.id
    );

    const conditions = [eq(friendRequests.senderId, userId), eq(friendRequests.status, 'pending')];
    if (cursorCondition) {
      conditions.push(cursorCondition);
    }

    const items = await this.db
      .select()
      .from(friendRequests)
      .where(and(...conditions))
      .orderBy(sortDirection(friendRequests.createdAt), sortDirection(friendRequests.id))
      .limit(getPaginationLimit(pagination));

    return createPaginatedResponse(
      items,
      pagination,
      item => item.createdAt,
      item => item.id
    );
  }

  async removeFriend(userId: string, friendId: string): Promise<{ message: string }> {
    const isFriends = await this.isFriends(userId, friendId);
    if (!isFriends) {
      throw new NotFoundException('Friendship not found');
    }

    await this.db.transaction(async tx => {
      await tx
        .delete(friends)
        .where(
          or(
            and(eq(friends.userId, userId), eq(friends.friendId, friendId)),
            and(eq(friends.userId, friendId), eq(friends.friendId, userId))
          )
        );

      await tx
        .delete(friendRequests)
        .where(
          or(
            and(eq(friendRequests.senderId, userId), eq(friendRequests.receiverId, friendId)),
            and(eq(friendRequests.senderId, friendId), eq(friendRequests.receiverId, userId))
          )
        );
    });

    return { message: 'Friend removed successfully' };
  }

  async getFriends(
    userId: string,
    pagination: PaginationConfig
  ): Promise<PaginatedResponse<Friend>> {
    const sortDirection = getSortDirection(pagination.direction);
    const cursorCondition = buildCursorCondition(pagination, friends.createdAt, friends.id);

    const conditions = [eq(friends.userId, userId)];
    if (cursorCondition) {
      conditions.push(cursorCondition);
    }

    const items = await this.db
      .select()
      .from(friends)
      .where(and(...conditions))
      .orderBy(sortDirection(friends.createdAt), sortDirection(friends.id))
      .limit(getPaginationLimit(pagination));

    return createPaginatedResponse(
      items,
      pagination,
      item => item.createdAt,
      item => item.id
    );
  }

  async isFriends(userId: string, friendId: string): Promise<boolean> {
    const [result] = await this.db
      .select()
      .from(friends)
      .where(and(eq(friends.userId, userId), eq(friends.friendId, friendId)))
      .limit(1);

    return !!result;
  }

  async getFriendRequestById(requestId: string): Promise<FriendRequest | null> {
    const [result] = await this.db
      .select()
      .from(friendRequests)
      .where(eq(friendRequests.id, requestId))
      .limit(1);

    return result ?? null;
  }

  private async checkExistingFriendRequest(
    senderId: string,
    receiverId: string
  ): Promise<FriendRequest | null> {
    const [result] = await this.db
      .select()
      .from(friendRequests)
      .where(
        or(
          and(eq(friendRequests.senderId, senderId), eq(friendRequests.receiverId, receiverId)),
          and(eq(friendRequests.senderId, receiverId), eq(friendRequests.receiverId, senderId))
        )
      )
      .limit(1);

    return result ?? null;
  }
}
