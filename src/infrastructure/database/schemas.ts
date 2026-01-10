import {
  boolean,
  index,
  integer,
  jsonb,
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

export const conversationTypeEnum = pgEnum('conversation_type', ['direct', 'group']);

export const memberRoleEnum = pgEnum('member_role', ['owner', 'admin', 'member']);

export const messageTypeEnum = pgEnum('message_type', [
  'text',
  'image',
  'file',
  'audio',
  'video',
  'system', // for system messages like "User joined the group"
]);

export const messageStatusEnum = pgEnum('message_status', ['sent', 'delivered', 'read']);

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
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
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

export const conversations = pgTable(
  'conversations',
  {
    id: text('id').primaryKey().notNull(),
    type: conversationTypeEnum('type').notNull(),
    name: varchar('name', { length: 255 }),
    description: text('description'),
    avatarUrl: text('avatar_url'),
    createdBy: text('created_by').references(() => users.id, { onDelete: 'cascade' }),
    lastMessageAt: timestamp('last_message_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  table => [
    index('conversation_type_idx').on(table.type),
    index('conversation_last_message_at_idx').on(table.lastMessageAt),
    index('conversation_created_at_idx').on(table.createdAt),
    index('conversation_type_last_message_idx').on(table.type, table.lastMessageAt),
  ]
);

export const conversationMembers = pgTable(
  'conversation_members',
  {
    id: text('id').primaryKey().notNull(),
    conversationId: text('conversation_id')
      .references(() => conversations.id, { onDelete: 'cascade' })
      .notNull(),
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    role: memberRoleEnum('role').default('member').notNull(),
    nickname: varchar('nickname', { length: 100 }),
    lastMessageReadId: text('last_message_read_id').references(() => messages.id, {
      onDelete: 'set null',
    }),
    lastReadAt: timestamp('last_read_at', { withTimezone: true }),
    joinedAt: timestamp('joined_at', { withTimezone: true }).defaultNow().notNull(),
    leftAt: timestamp('left_at', { withTimezone: true }),
  },
  table => [
    uniqueIndex('conversation_members_unique_idx').on(table.conversationId, table.userId),
    index('conversation_members_user_idx').on(table.userId),
  ]
);

export const messages = pgTable(
  'messages',
  {
    id: text('id').primaryKey().notNull(),
    conversationId: text('conversation_id')
      .references(() => conversations.id, { onDelete: 'cascade' })
      .notNull(),
    senderId: text('sender_id').references(() => users.id, { onDelete: 'set null' }),
    content: text('content'),
    type: messageTypeEnum('type').notNull().default('text'),
    replyToId: text('reply_to_id'),
    forwaredFromId: text('forwarded_from_id'),
    isEdited: boolean('is_edited').default(false).notNull(),
    editedAt: timestamp('edited_at', { withTimezone: true }),
    isDeleted: boolean('is_deleted').default(false).notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }),
    deletedForEveryone: boolean('deleted_for_everyone').default(false).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
    metadata: jsonb('metadata'),
  },
  table => [
    index('messages_conversation_idx').on(table.conversationId),
    index('messages_sender_idx').on(table.senderId),
    index('messages_created_at_idx').on(table.createdAt),
    index('messages_conversation_created_at_idx').on(table.conversationId, table.createdAt),
    index('messages_reply_to_idx').on(table.replyToId),
  ]
);

export const messageAttachments = pgTable(
  'message_attachments',
  {
    id: text('id').primaryKey().notNull(),
    messageId: text('message_id')
      .references(() => messages.id, { onDelete: 'cascade' })
      .notNull(),
    fileName: varchar('file_name', { length: 255 }).notNull(),
    fileUrl: text('file_url').notNull(),
    fileType: varchar('file_type', { length: 100 }).notNull(),
    fileSize: integer('file_size').notNull(),
    duration: integer('duration'),
    thumbnailUrl: text('thumbnail_url'),
    blurHash: text('blur_hash'),
    uploadedAt: timestamp('uploaded_at', { withTimezone: true }).defaultNow().notNull(),
  },
  table => [
    index('message_attachments_message_idx').on(table.messageId),
    index('message_attachments_file_type_idx').on(table.fileType),
    index('message_attachments_uploaded_at_idx').on(table.uploadedAt),
  ]
);

export const messageReactions = pgTable(
  'message_reactions',
  {
    id: text('id').primaryKey().notNull(),
    messageId: text('message_id')
      .references(() => messages.id, { onDelete: 'cascade' })
      .notNull(),
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    reaction: varchar('reaction', { length: 100 }).notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).defaultNow().notNull(),
  },
  table => [
    uniqueIndex('message_reactions_unique_idx').on(table.messageId, table.userId, table.reaction),
    index('message_reactions_user_idx').on(table.userId),
  ]
);

export const messageReadReceipts = pgTable(
  'message_read_receipts',
  {
    id: text('id').primaryKey().notNull(),
    messageId: text('message_id')
      .references(() => messages.id, { onDelete: 'cascade' })
      .notNull(),
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    status: messageStatusEnum('status').notNull().default('sent'),
    readAt: timestamp('read_at', { withTimezone: true }).defaultNow().notNull(),
    deliveredAt: timestamp('delivered_at', { withTimezone: true }),
  },
  table => [
    uniqueIndex('message_read_receipts_unique_idx').on(table.messageId, table.userId),
    index('message_read_receipts_user_idx').on(table.userId),
    index('message_read_receipts_status_idx').on(table.status),
  ]
);

export const deletedMessages = pgTable(
  'deleted_messages',
  {
    id: text('id').primaryKey().notNull(),
    messageId: text('message_id')
      .references(() => messages.id, { onDelete: 'cascade' })
      .notNull(),
    userId: text('user_id')
      .references(() => users.id, { onDelete: 'cascade' })
      .notNull(),
    deletedAt: timestamp('deleted_at', { withTimezone: true }).defaultNow().notNull(),
  },
  table => [uniqueIndex('deleted_messages_unique_idx').on(table.messageId, table.userId)]
);
