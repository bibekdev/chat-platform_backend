import {
  boolean,
  index,
  pgEnum,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  varchar,
} from 'drizzle-orm/pg-core';

export const friendRequestStatusEnum = pgEnum('friend_request_status', [
  'pending',
  'accepted',
  'rejected',
]);

export const users = pgTable(
  'users',
  {
    id: text('id').primaryKey().notNull(),
    name: varchar('name', { length: 255 }).notNull(),
    email: varchar('email', { length: 255 }).notNull().unique(),
    avatar: text('avatar').notNull(),
    password: varchar('password', { length: 255 }).notNull(),
    lastLoggedInAt: timestamp('last_logged_in_at', { withTimezone: true }),

    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
  },
  table => [index('users_email_idx').on(table.email)]
);

export const refreshTokens = pgTable(
  'refresh_tokens',
  {
    id: text('id').primaryKey(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    tokenHash: text('token_hash').notNull(),
    family: uuid('family').notNull(),
    isRevoked: boolean('is_revoked').default(false).notNull(),
    expiresAt: timestamp('expires_at', { withTimezone: true }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    userAgent: text('user_agent'),
    ipAddress: varchar('ip_address', { length: 45 }),
  },
  table => [
    index('refresh_tokens_user_id_idx').on(table.userId),
    index('refresh_tokens_token_idx').on(table.tokenHash),
    index('refresh_tokens_expires_at_idx').on(table.expiresAt),
  ]
);

export const friendRequests = pgTable(
  'friend_requests',
  {
    id: text('id').primaryKey().notNull(),
    senderId: text('sender_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    receiverId: text('receiver_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    status: friendRequestStatusEnum('status').notNull().default('pending'),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp('updated_at').defaultNow().notNull(),
  },
  table => [
    uniqueIndex('unique_friend_request').on(table.senderId, table.receiverId),
    index('friend_requests_receiver_idx').on(table.receiverId),
    index('friend_requests_sender_idx').on(table.senderId),
    index('friend_requests_status_idx').on(table.status),
  ]
);

export const friends = pgTable(
  'friends',
  {
    id: text('id').primaryKey().notNull(),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    friendId: text('friend_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    createdAt: timestamp('created_at').defaultNow().notNull(),
  },
  table => [
    uniqueIndex('unique_friendship').on(table.userId, table.friendId),
    index('friends_user_idx').on(table.userId),
    index('friends_friend_idx').on(table.friendId),
  ]
);
