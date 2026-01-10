import { Inject, Injectable } from '@nestjs/common';
import { and, eq, notInArray, sql } from 'drizzle-orm';

import {
  buildCursorCondition,
  createPaginatedResponse,
  getPaginationLimit,
  getSortDirection,
  PaginatedResponse,
  PaginationConfig,
} from '@/common/lib/pagination';
import { generateRandomAvatar, generateUniqueId } from '@/common/lib/utils';
import { DATABASE_CONNECTION } from '@/infrastructure/database/constants';
import { friendRequests, friends, users } from '@/infrastructure/database/schemas';
import {
  DrizzleDB,
  InsertUser,
  PublicUser,
  UpdateUser,
  User,
} from '@/infrastructure/database/types';

@Injectable()
export class UsersService {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: DrizzleDB) {}

  async findByEmail(email: string): Promise<User | undefined> {
    const result = await this.db.select().from(users).where(eq(users.email, email)).limit(1);
    return result[0];
  }

  async findById(id: string): Promise<User | undefined> {
    const result = await this.db.select().from(users).where(eq(users.id, id)).limit(1);
    return result[0];
  }

  async createUser(dto: InsertUser): Promise<User> {
    const result = await this.db
      .insert(users)
      .values({ ...dto, id: generateUniqueId('user'), avatar: generateRandomAvatar() })
      .returning();
    return result[0];
  }

  async updateUser(userId: string, dto: UpdateUser): Promise<void> {
    await this.db
      .update(users)
      .set({ ...dto, updatedAt: sql`now()` })
      .where(eq(users.id, userId));
  }

  sanitizeUser(user: User): Omit<User, 'password'> {
    const { password, ...rest } = user;
    return rest;
  }

  async getUserSuggestions(
    userId: string,
    pagination: PaginationConfig
  ): Promise<PaginatedResponse<PublicUser & { createdAt: Date }>> {
    const sortDirection = getSortDirection(pagination.direction);
    const cursorCondition = buildCursorCondition(pagination, users.createdAt, users.id);

    // Get friend IDs
    const friendIds = this.db
      .select({ id: friends.friendId })
      .from(friends)
      .where(eq(friends.userId, userId));

    // Get user IDs with pending friend requests (sent or received)
    const pendingRequestUserIds = this.db
      .select({ id: friendRequests.receiverId })
      .from(friendRequests)
      .where(and(eq(friendRequests.senderId, userId), eq(friendRequests.status, 'pending')));

    const pendingReceivedUserIds = this.db
      .select({ id: friendRequests.senderId })
      .from(friendRequests)
      .where(and(eq(friendRequests.receiverId, userId), eq(friendRequests.status, 'pending')));

    const conditions = [
      // Exclude self
      sql`${users.id} != ${userId}`,
      // Exclude friends
      notInArray(users.id, friendIds),
      // Exclude users with pending sent requests
      notInArray(users.id, pendingRequestUserIds),
      // Exclude users with pending received requests
      notInArray(users.id, pendingReceivedUserIds),
    ];

    if (cursorCondition) {
      conditions.push(cursorCondition);
    }

    const rows = await this.db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        avatar: users.avatar,
        createdAt: users.createdAt,
      })
      .from(users)
      .where(and(...conditions))
      .orderBy(sortDirection(users.createdAt), sortDirection(users.id))
      .limit(getPaginationLimit(pagination));

    // Map to PublicUser (without createdAt)
    const publicUsers: (PublicUser & { createdAt: Date })[] = rows;

    return createPaginatedResponse(
      publicUsers,
      pagination,
      item => item.createdAt,
      item => item.id
    );
  }
}
