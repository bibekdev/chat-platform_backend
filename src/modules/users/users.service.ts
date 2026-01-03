import { Inject, Injectable } from '@nestjs/common';
import { eq, sql } from 'drizzle-orm';

import { generateRandomAvatar, generateUniqueId } from '@/common/lib/utils';
import { DATABASE_CONNECTION } from '@/infrastructure/database/constants';
import { users } from '@/infrastructure/database/schemas';
import { DrizzleDB, InsertUser, UpdateUser, User } from '@/infrastructure/database/types';

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
}
