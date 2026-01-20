# Conversations Module

A complete real-time chat module for the Chat Platform API, supporting direct messages, group conversations, message management, reactions, read receipts, and WebSocket-based real-time updates.

## Table of Contents

- [Overview](#overview)
- [File Structure](#file-structure)
- [Code Implementations](#code-implementations)
  - [Module Definition](#1-module-definition)
  - [Types](#2-types)
  - [DTOs](#3-dtos)
  - [Conversations Service](#4-conversations-service)
  - [Messages Service](#5-messages-service)
  - [Controller](#6-controller)
  - [WebSocket Gateway](#7-websocket-gateway)
  - [Index Exports](#8-index-exports)
- [API Reference](#api-reference)
- [WebSocket Events](#websocket-events)
- [Usage Examples](#usage-examples)

---

## Overview

The Conversations module provides:

- **Direct Conversations** - 1:1 private messaging between users
- **Group Conversations** - Multi-user chat rooms with roles (owner/admin/member)
- **Messages** - Text, image, file, audio, video, and system messages
- **Attachments** - File uploads with metadata (thumbnails, duration, blur hash)
- **Replies** - Reply to specific messages
- **Reactions** - Emoji reactions on messages
- **Read Receipts** - Track who has read messages
- **Typing Indicators** - Real-time typing status
- **Real-time Updates** - WebSocket events for instant updates

---

## File Structure

```
src/modules/conversations/
├── conversations.module.ts      # Module definition
├── conversations.controller.ts  # REST API endpoints
├── conversations.service.ts     # Conversation business logic
├── conversations.gateway.ts     # WebSocket gateway
├── messages.service.ts          # Message business logic
├── types.ts                     # TypeScript types & event constants
├── index.ts                     # Public exports
├── README.md                    # This file
└── dtos/
    └── conversations.dto.ts     # Request validation DTOs
```

---

## Code Implementations

### 1. Module Definition

**`conversations.module.ts`**

```typescript
import { Module } from '@nestjs/common';

import { WebsocketsModule } from '@/infrastructure/websockets/websockets.module';
import { ConversationsController } from './conversations.controller';
import { ConversationsGateway } from './conversations.gateway';
import { ConversationsService } from './conversations.service';
import { MessagesService } from './messages.service';

@Module({
  imports: [WebsocketsModule],
  controllers: [ConversationsController],
  providers: [ConversationsService, MessagesService, ConversationsGateway],
  exports: [ConversationsService, MessagesService, ConversationsGateway],
})
export class ConversationsModule {}
```

---

### 2. Types

**`types.ts`**

```typescript
import {
  Conversation,
  ConversationMember,
  Message,
  MessageAttachment,
  MessageReaction,
  PublicUser,
} from '@/infrastructure/database/types';

// ==================== CONVERSATION TYPES ====================

export type LastMessageWithSender = {
  id: string;
  content: string | null;
  type: 'text' | 'image' | 'file' | 'audio' | 'video' | 'system';
  createdAt: Date;
  sender: PublicUser | null;
};

export type ConversationWithLastMessage = Conversation & {
  lastMessage: LastMessageWithSender | null;
};

export type ConversationMemberWithUser = ConversationMember & {
  user: PublicUser;
};

export type ConversationWithMembers = Conversation & {
  members: ConversationMemberWithUser[];
};

export type ConversationWithDetails = Conversation & {
  members: ConversationMemberWithUser[];
  lastMessage: LastMessageWithSender | null;
  unreadCount?: number;
};

// For direct conversations, include the other participant's info
export type DirectConversationInfo = ConversationWithLastMessage & {
  otherParticipant: PublicUser;
};

// ==================== MESSAGE TYPES ====================

export type MessageWithSender = Message & {
  sender: PublicUser | null;
};

export type MessageWithDetails = Message & {
  sender: PublicUser | null;
  attachments: MessageAttachment[];
  reactions: MessageReactionGrouped[];
  replyTo: MessageWithSender | null;
};

export type MessageReactionGrouped = {
  reaction: string;
  count: number;
  users: PublicUser[];
  hasReacted: boolean; // Whether the current user has reacted
};

// ==================== WEBSOCKET EVENT TYPES ====================

export type NewMessageEvent = {
  conversationId: string;
  message: MessageWithDetails;
};

export type MessageUpdatedEvent = {
  conversationId: string;
  message: MessageWithDetails;
};

export type MessageDeletedEvent = {
  conversationId: string;
  messageId: string;
  deletedForEveryone: boolean;
};

export type TypingEvent = {
  conversationId: string;
  user: PublicUser;
  isTyping: boolean;
};

export type MessageReadEvent = {
  conversationId: string;
  messageId: string;
  userId: string;
  readAt: Date;
};

export type MemberJoinedEvent = {
  conversationId: string;
  member: ConversationMemberWithUser;
};

export type MemberLeftEvent = {
  conversationId: string;
  userId: string;
  leftAt: Date;
};

export type ConversationUpdatedEvent = {
  conversationId: string;
  updates: Partial<Pick<Conversation, 'name' | 'description' | 'avatarUrl'>>;
};

// ==================== WEBSOCKET EVENTS ====================

export const CONVERSATION_EVENTS = {
  // Client -> Server
  JOIN_CONVERSATION: 'conversation:join',
  LEAVE_CONVERSATION: 'conversation:leave',
  SEND_MESSAGE: 'message:send',
  EDIT_MESSAGE: 'message:edit',
  DELETE_MESSAGE: 'message:delete',
  TYPING_START: 'typing:start',
  TYPING_STOP: 'typing:stop',
  MARK_READ: 'message:read',
  ADD_REACTION: 'reaction:add',
  REMOVE_REACTION: 'reaction:remove',

  // Server -> Client
  NEW_MESSAGE: 'message:new',
  MESSAGE_UPDATED: 'message:updated',
  MESSAGE_DELETED: 'message:deleted',
  USER_TYPING: 'user:typing',
  MESSAGE_READ: 'message:read:update',
  MEMBER_JOINED: 'member:joined',
  MEMBER_LEFT: 'member:left',
  CONVERSATION_UPDATED: 'conversation:updated',
  ERROR: 'error',
} as const;
```

---

### 3. DTOs

**`dtos/conversations.dto.ts`**

```typescript
import { createZodDto } from 'nestjs-zod';
import { z } from 'zod';

// ==================== CONVERSATION DTOs ====================

export const createConversationSchema = z
  .object({
    type: z.enum(['direct', 'group']),
    name: z.string().min(1).max(100).optional(),
    description: z.string().max(500).optional(),
    avatarUrl: z.string().url().optional(),
    memberIds: z.array(z.string()).min(1),
  })
  .refine(
    data => {
      if (data.type === 'group' && !data.name) {
        return false;
      }
      return true;
    },
    { message: 'Group conversations must have a name', path: ['name'] }
  )
  .refine(
    data => {
      if (data.type === 'direct' && data.memberIds.length !== 1) {
        return false;
      }
      return true;
    },
    { message: 'Direct conversations must have exactly one other member', path: ['memberIds'] }
  );

export class CreateConversationDto extends createZodDto(createConversationSchema) {}

export const updateConversationSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  description: z.string().max(500).optional().nullable(),
  avatarUrl: z.string().url().optional().nullable(),
});

export class UpdateConversationDto extends createZodDto(updateConversationSchema) {}

export const addMembersSchema = z.object({
  memberIds: z.array(z.string()).min(1).max(50),
});

export class AddMembersDto extends createZodDto(addMembersSchema) {}

export const updateMemberRoleSchema = z.object({
  role: z.enum(['admin', 'member']),
});

export class UpdateMemberRoleDto extends createZodDto(updateMemberRoleSchema) {}

// ==================== MESSAGE DTOs ====================

export const sendMessageSchema = z.object({
  content: z.string().min(1).max(4000).optional(),
  type: z.enum(['text', 'image', 'file', 'audio', 'video']).default('text'),
  replyToId: z.string().optional(),
  attachments: z
    .array(
      z.object({
        fileName: z.string().min(1).max(255),
        fileUrl: z.string().url(),
        fileType: z.string().min(1).max(100),
        fileSize: z.number().positive(),
        duration: z.number().positive().optional(),
        thumbnailUrl: z.string().url().optional(),
        blurHash: z.string().optional(),
      })
    )
    .optional(),
});

export class SendMessageDto extends createZodDto(sendMessageSchema) {}

export const editMessageSchema = z.object({
  content: z.string().min(1).max(4000),
});

export class EditMessageDto extends createZodDto(editMessageSchema) {}

export const addReactionSchema = z.object({
  reaction: z.string().min(1).max(100),
});

export class AddReactionDto extends createZodDto(addReactionSchema) {}

// ==================== PARAM DTOs ====================

export const conversationIdParamSchema = z.object({
  conversationId: z.string().min(1),
});

export class ConversationIdParamDto extends createZodDto(conversationIdParamSchema) {}

export const messageIdParamSchema = z.object({
  conversationId: z.string().min(1),
  messageId: z.string().min(1),
});

export class MessageIdParamDto extends createZodDto(messageIdParamSchema) {}

export const memberIdParamSchema = z.object({
  conversationId: z.string().min(1),
  memberId: z.string().min(1),
});

export class MemberIdParamDto extends createZodDto(memberIdParamSchema) {}
```

---

### 4. Conversations Service

**`conversations.service.ts`**

```typescript
import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, inArray, isNotNull, not, or, sql, SQL } from 'drizzle-orm';

import {
  createPaginatedResponse,
  decodeCursor,
  getPaginationLimit,
  PaginatedResponse,
  PaginationConfig,
} from '@/common/lib/pagination';
import { generateUniqueId } from '@/common/lib/utils';
import { DATABASE_CONNECTION } from '@/infrastructure/database/constants';
import {
  conversationMembers,
  conversations,
  messages,
  users,
} from '@/infrastructure/database/schemas';
import {
  Conversation,
  ConversationMember,
  DrizzleDB,
  PublicUser,
} from '@/infrastructure/database/types';
import {
  AddMembersDto,
  CreateConversationDto,
  UpdateConversationDto,
  UpdateMemberRoleDto,
} from './dtos/conversations.dto';
import {
  ConversationMemberWithUser,
  ConversationWithDetails,
  ConversationWithLastMessage,
  ConversationWithMembers,
} from './types';

@Injectable()
export class ConversationsService {
  constructor(@Inject(DATABASE_CONNECTION) private readonly db: DrizzleDB) {}

  // ==================== CONVERSATION CRUD ====================

  async createConversation(creatorId: string, dto: CreateConversationDto): Promise<Conversation> {
    const { type, name, description, avatarUrl, memberIds } = dto;

    if (type === 'direct') {
      if (memberIds.length !== 1) {
        throw new BadRequestException('Direct conversations must have exactly one other member');
      }
      if (memberIds[0] === creatorId) {
        throw new BadRequestException('Cannot create a conversation with yourself');
      }

      // Check if a direct conversation already exists between these two users
      const existingConversation = await this.findExistingDirectConversation(
        creatorId,
        memberIds[0]
      );
      if (existingConversation) {
        return existingConversation;
      }
    }

    if (type === 'group') {
      if (memberIds.length < 1) {
        throw new BadRequestException('Group conversations must have at least one other member');
      }
      if (!name) {
        throw new BadRequestException('Group conversations must have a name');
      }
    }

    const allMemberIds = [creatorId, ...memberIds.filter(id => id !== creatorId)];

    return await this.db.transaction(async tx => {
      const [conversation] = await tx
        .insert(conversations)
        .values({
          id: generateUniqueId('conv'),
          type,
          name: name ?? null,
          description: description ?? null,
          avatarUrl: avatarUrl ?? null,
          createdBy: creatorId,
        })
        .returning();

      const memberRecords = allMemberIds.map((userId, index) => ({
        id: generateUniqueId('cm'),
        conversationId: conversation.id,
        userId,
        role: index === 0 ? ('owner' as const) : ('member' as const),
      }));

      await tx.insert(conversationMembers).values(memberRecords);

      return conversation;
    });
  }

  async findExistingDirectConversation(
    userId1: string,
    userId2: string
  ): Promise<Conversation | null> {
    const result = await this.db
      .select({
        conversation: conversations,
      })
      .from(conversations)
      .innerJoin(conversationMembers, eq(conversations.id, conversationMembers.conversationId))
      .where(and(eq(conversations.type, 'direct'), eq(conversationMembers.userId, userId1)))
      .innerJoin(
        sql`${conversationMembers} AS cm2`,
        sql`${conversations.id} = cm2.conversation_id AND cm2.user_id = ${userId2}`
      )
      .limit(1);

    return result[0]?.conversation ?? null;
  }

  async findConversationById(conversationId: string): Promise<Conversation | null> {
    const [result] = await this.db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);
    return result ?? null;
  }

  async getConversationWithMembers(
    conversationId: string,
    userId: string
  ): Promise<ConversationWithMembers | null> {
    // Verify user is a member
    const isMember = await this.isConversationMember(conversationId, userId);
    if (!isMember) {
      throw new ForbiddenException('You are not a member of this conversation');
    }

    const [conversation] = await this.db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);

    if (!conversation) {
      return null;
    }

    const members = await this.getConversationMembers(conversationId);

    return {
      ...conversation,
      members,
    };
  }

  async getConversationWithDetails(
    conversationId: string,
    userId: string
  ): Promise<ConversationWithDetails | null> {
    const conversationWithMembers = await this.getConversationWithMembers(conversationId, userId);
    if (!conversationWithMembers) {
      return null;
    }

    // Get last message
    const lastMessage = await this.getLastMessage(conversationId);

    // Get unread count
    const unreadCount = await this.getUnreadCount(conversationId, userId);

    return {
      ...conversationWithMembers,
      lastMessage,
      unreadCount,
    };
  }

  async findConversationsByUserId(
    userId: string,
    pagination: PaginationConfig
  ): Promise<PaginatedResponse<ConversationWithLastMessage>> {
    const sortColumn = sql`COALESCE(${conversations.lastMessageAt}, ${conversations.createdAt})`;

    const cursorCondition = this.buildCoalesceCursorCondition(pagination, sortColumn);

    const conditions = [
      eq(conversationMembers.userId, userId),
      or(
        eq(conversations.type, 'group'),
        and(eq(conversations.type, 'direct'), isNotNull(conversations.lastMessageAt))
      ),
    ];

    if (cursorCondition) {
      conditions.push(cursorCondition);
    }

    const rows = await this.db
      .select({
        id: conversations.id,
        type: conversations.type,
        name: conversations.name,
        description: conversations.description,
        avatarUrl: conversations.avatarUrl,
        createdBy: conversations.createdBy,
        lastMessageAt: conversations.lastMessageAt,
        createdAt: conversations.createdAt,
        updatedAt: conversations.updatedAt,
        messageId: messages.id,
        messageContent: messages.content,
        messageType: messages.type,
        messageCreatedAt: messages.createdAt,
        senderId: users.id,
        senderName: users.name,
        senderEmail: users.email,
        senderAvatar: users.avatar,
      })
      .from(conversations)
      .innerJoin(conversationMembers, eq(conversations.id, conversationMembers.conversationId))
      .leftJoin(
        messages,
        and(
          eq(messages.conversationId, conversations.id),
          eq(messages.createdAt, conversations.lastMessageAt)
        )
      )
      .leftJoin(users, eq(users.id, messages.senderId))
      .where(and(...conditions))
      .orderBy(sql`${sortColumn} DESC`)
      .limit(getPaginationLimit(pagination));

    const transformedRows: ConversationWithLastMessage[] = rows.map(row => ({
      id: row.id,
      type: row.type,
      name: row.name,
      description: row.description,
      avatarUrl: row.avatarUrl,
      createdBy: row.createdBy,
      lastMessageAt: row.lastMessageAt,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      lastMessage: row.messageId
        ? {
            id: row.messageId,
            content: row.messageContent,
            type: row.messageType!,
            createdAt: row.messageCreatedAt!,
            sender: row.senderId
              ? {
                  id: row.senderId,
                  name: row.senderName!,
                  email: row.senderEmail!,
                  avatar: row.senderAvatar!,
                }
              : null,
          }
        : null,
    }));

    return createPaginatedResponse(
      transformedRows,
      pagination,
      item => item.lastMessageAt ?? item.createdAt,
      item => item.id
    );
  }

  async updateConversation(
    conversationId: string,
    userId: string,
    dto: UpdateConversationDto
  ): Promise<Conversation> {
    const conversation = await this.findConversationById(conversationId);
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    if (conversation.type === 'direct') {
      throw new BadRequestException('Cannot update direct conversations');
    }

    // Check if user is owner or admin
    const member = await this.getConversationMember(conversationId, userId);
    if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
      throw new ForbiddenException('Only owners and admins can update conversation');
    }

    const [updated] = await this.db
      .update(conversations)
      .set({
        ...dto,
        updatedAt: new Date(),
      })
      .where(eq(conversations.id, conversationId))
      .returning();

    return updated;
  }

  async deleteConversation(conversationId: string, userId: string): Promise<void> {
    const conversation = await this.findConversationById(conversationId);
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    if (conversation.type === 'group') {
      if (conversation.createdBy !== userId) {
        throw new ForbiddenException('Only the owner can delete this conversation');
      }
    } else {
      // For direct conversations, verify user is a member
      const isMember = await this.isConversationMember(conversationId, userId);
      if (!isMember) {
        throw new ForbiddenException('You are not a member of this conversation');
      }
    }

    await this.db.delete(conversations).where(eq(conversations.id, conversationId));
  }

  // ==================== MEMBER MANAGEMENT ====================

  async getConversationMembers(conversationId: string): Promise<ConversationMemberWithUser[]> {
    const rows = await this.db
      .select({
        id: conversationMembers.id,
        conversationId: conversationMembers.conversationId,
        userId: conversationMembers.userId,
        role: conversationMembers.role,
        nickname: conversationMembers.nickname,
        lastMessageReadId: conversationMembers.lastMessageReadId,
        lastReadAt: conversationMembers.lastReadAt,
        joinedAt: conversationMembers.joinedAt,
        leftAt: conversationMembers.leftAt,
        user: {
          id: users.id,
          name: users.name,
          email: users.email,
          avatar: users.avatar,
        },
      })
      .from(conversationMembers)
      .innerJoin(users, eq(conversationMembers.userId, users.id))
      .where(
        and(
          eq(conversationMembers.conversationId, conversationId),
          sql`${conversationMembers.leftAt} IS NULL`
        )
      );

    return rows;
  }

  async getConversationMember(
    conversationId: string,
    userId: string
  ): Promise<ConversationMember | null> {
    const [result] = await this.db
      .select()
      .from(conversationMembers)
      .where(
        and(
          eq(conversationMembers.conversationId, conversationId),
          eq(conversationMembers.userId, userId),
          sql`${conversationMembers.leftAt} IS NULL`
        )
      )
      .limit(1);
    return result ?? null;
  }

  async isConversationMember(conversationId: string, userId: string): Promise<boolean> {
    const member = await this.getConversationMember(conversationId, userId);
    return member !== null;
  }

  async addMembers(
    conversationId: string,
    userId: string,
    dto: AddMembersDto
  ): Promise<ConversationMemberWithUser[]> {
    const conversation = await this.findConversationById(conversationId);
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    if (conversation.type === 'direct') {
      throw new BadRequestException('Cannot add members to direct conversations');
    }

    // Check if user is owner or admin
    const member = await this.getConversationMember(conversationId, userId);
    if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
      throw new ForbiddenException('Only owners and admins can add members');
    }

    // Filter out existing members
    const existingMembers = await this.db
      .select({ userId: conversationMembers.userId })
      .from(conversationMembers)
      .where(
        and(
          eq(conversationMembers.conversationId, conversationId),
          inArray(conversationMembers.userId, dto.memberIds)
        )
      );

    const existingMemberIds = new Set(existingMembers.map(m => m.userId));
    const newMemberIds = dto.memberIds.filter(id => !existingMemberIds.has(id));

    if (newMemberIds.length === 0) {
      return [];
    }

    const memberRecords = newMemberIds.map(memberId => ({
      id: generateUniqueId('cm'),
      conversationId,
      userId: memberId,
      role: 'member' as const,
    }));

    await this.db.insert(conversationMembers).values(memberRecords);

    // Return the newly added members with user info
    const addedMembers = await this.db
      .select({
        id: conversationMembers.id,
        conversationId: conversationMembers.conversationId,
        userId: conversationMembers.userId,
        role: conversationMembers.role,
        nickname: conversationMembers.nickname,
        lastMessageReadId: conversationMembers.lastMessageReadId,
        lastReadAt: conversationMembers.lastReadAt,
        joinedAt: conversationMembers.joinedAt,
        leftAt: conversationMembers.leftAt,
        user: {
          id: users.id,
          name: users.name,
          email: users.email,
          avatar: users.avatar,
        },
      })
      .from(conversationMembers)
      .innerJoin(users, eq(conversationMembers.userId, users.id))
      .where(
        and(
          eq(conversationMembers.conversationId, conversationId),
          inArray(conversationMembers.userId, newMemberIds)
        )
      );

    return addedMembers;
  }

  async removeMember(
    conversationId: string,
    userId: string,
    memberIdToRemove: string
  ): Promise<void> {
    const conversation = await this.findConversationById(conversationId);
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    if (conversation.type === 'direct') {
      throw new BadRequestException('Cannot remove members from direct conversations');
    }

    const actingMember = await this.getConversationMember(conversationId, userId);
    if (!actingMember) {
      throw new ForbiddenException('You are not a member of this conversation');
    }

    const memberToRemove = await this.getConversationMember(conversationId, memberIdToRemove);
    if (!memberToRemove) {
      throw new NotFoundException('Member not found in this conversation');
    }

    // Cannot remove owner
    if (memberToRemove.role === 'owner') {
      throw new ForbiddenException('Cannot remove the owner of the conversation');
    }

    // Only owner can remove admins, owner and admins can remove members
    if (memberToRemove.role === 'admin' && actingMember.role !== 'owner') {
      throw new ForbiddenException('Only the owner can remove admins');
    }

    if (actingMember.role === 'member' && userId !== memberIdToRemove) {
      throw new ForbiddenException('Members can only remove themselves');
    }

    // Soft delete - set leftAt
    await this.db
      .update(conversationMembers)
      .set({ leftAt: new Date() })
      .where(
        and(
          eq(conversationMembers.conversationId, conversationId),
          eq(conversationMembers.userId, memberIdToRemove)
        )
      );
  }

  async leaveConversation(conversationId: string, userId: string): Promise<void> {
    const conversation = await this.findConversationById(conversationId);
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    if (conversation.type === 'direct') {
      throw new BadRequestException('Cannot leave direct conversations');
    }

    const member = await this.getConversationMember(conversationId, userId);
    if (!member) {
      throw new NotFoundException('You are not a member of this conversation');
    }

    // If owner is leaving, transfer ownership or delete
    if (member.role === 'owner') {
      const otherMembers = await this.db
        .select()
        .from(conversationMembers)
        .where(
          and(
            eq(conversationMembers.conversationId, conversationId),
            not(eq(conversationMembers.userId, userId)),
            sql`${conversationMembers.leftAt} IS NULL`
          )
        )
        .orderBy(sql`CASE WHEN ${conversationMembers.role} = 'admin' THEN 0 ELSE 1 END`)
        .limit(1);

      if (otherMembers.length > 0) {
        // Transfer ownership
        await this.db
          .update(conversationMembers)
          .set({ role: 'owner' })
          .where(eq(conversationMembers.id, otherMembers[0].id));
      } else {
        // Delete conversation if no other members
        await this.db.delete(conversations).where(eq(conversations.id, conversationId));
        return;
      }
    }

    // Soft delete membership
    await this.db
      .update(conversationMembers)
      .set({ leftAt: new Date() })
      .where(
        and(
          eq(conversationMembers.conversationId, conversationId),
          eq(conversationMembers.userId, userId)
        )
      );
  }

  async updateMemberRole(
    conversationId: string,
    userId: string,
    memberId: string,
    dto: UpdateMemberRoleDto
  ): Promise<void> {
    const conversation = await this.findConversationById(conversationId);
    if (!conversation) {
      throw new NotFoundException('Conversation not found');
    }

    if (conversation.type === 'direct') {
      throw new BadRequestException('Cannot update roles in direct conversations');
    }

    const actingMember = await this.getConversationMember(conversationId, userId);
    if (!actingMember || actingMember.role !== 'owner') {
      throw new ForbiddenException('Only the owner can update member roles');
    }

    const memberToUpdate = await this.getConversationMember(conversationId, memberId);
    if (!memberToUpdate) {
      throw new NotFoundException('Member not found in this conversation');
    }

    if (memberToUpdate.role === 'owner') {
      throw new ForbiddenException('Cannot change the owner role');
    }

    await this.db
      .update(conversationMembers)
      .set({ role: dto.role })
      .where(
        and(
          eq(conversationMembers.conversationId, conversationId),
          eq(conversationMembers.userId, memberId)
        )
      );
  }

  // ==================== HELPER METHODS ====================

  async getConversationMemberIds(conversationId: string): Promise<string[]> {
    const members = await this.db
      .select({ userId: conversationMembers.userId })
      .from(conversationMembers)
      .where(
        and(
          eq(conversationMembers.conversationId, conversationId),
          sql`${conversationMembers.leftAt} IS NULL`
        )
      );
    return members.map(m => m.userId);
  }

  async updateLastMessageAt(conversationId: string, timestamp: Date): Promise<void> {
    await this.db
      .update(conversations)
      .set({ lastMessageAt: timestamp, updatedAt: new Date() })
      .where(eq(conversations.id, conversationId));
  }

  async markAsRead(conversationId: string, userId: string, messageId: string): Promise<void> {
    await this.db
      .update(conversationMembers)
      .set({
        lastMessageReadId: messageId,
        lastReadAt: new Date(),
      })
      .where(
        and(
          eq(conversationMembers.conversationId, conversationId),
          eq(conversationMembers.userId, userId)
        )
      );
  }

  private async getLastMessage(conversationId: string) {
    const [lastMsg] = await this.db
      .select({
        id: messages.id,
        content: messages.content,
        type: messages.type,
        createdAt: messages.createdAt,
        senderId: users.id,
        senderName: users.name,
        senderEmail: users.email,
        senderAvatar: users.avatar,
      })
      .from(messages)
      .leftJoin(users, eq(messages.senderId, users.id))
      .where(eq(messages.conversationId, conversationId))
      .orderBy(sql`${messages.createdAt} DESC`)
      .limit(1);

    if (!lastMsg) return null;

    return {
      id: lastMsg.id,
      content: lastMsg.content,
      type: lastMsg.type,
      createdAt: lastMsg.createdAt,
      sender: lastMsg.senderId
        ? {
            id: lastMsg.senderId,
            name: lastMsg.senderName!,
            email: lastMsg.senderEmail!,
            avatar: lastMsg.senderAvatar!,
          }
        : null,
    };
  }

  private async getUnreadCount(conversationId: string, userId: string): Promise<number> {
    const member = await this.getConversationMember(conversationId, userId);
    if (!member || !member.lastReadAt) {
      // Count all messages if never read
      const [result] = await this.db
        .select({ count: sql<number>`COUNT(*)` })
        .from(messages)
        .where(
          and(eq(messages.conversationId, conversationId), not(eq(messages.senderId, userId)))
        );
      return result?.count ?? 0;
    }

    const [result] = await this.db
      .select({ count: sql<number>`COUNT(*)` })
      .from(messages)
      .where(
        and(
          eq(messages.conversationId, conversationId),
          not(eq(messages.senderId, userId)),
          sql`${messages.createdAt} > ${member.lastReadAt}`
        )
      );

    return result?.count ?? 0;
  }

  async getOtherParticipant(conversationId: string, userId: string): Promise<PublicUser | null> {
    const [result] = await this.db
      .select({
        id: users.id,
        name: users.name,
        email: users.email,
        avatar: users.avatar,
      })
      .from(conversationMembers)
      .innerJoin(users, eq(conversationMembers.userId, users.id))
      .where(
        and(
          eq(conversationMembers.conversationId, conversationId),
          not(eq(conversationMembers.userId, userId)),
          sql`${conversationMembers.leftAt} IS NULL`
        )
      )
      .limit(1);

    return result ?? null;
  }

  private buildCoalesceCursorCondition(config: PaginationConfig, sortColumn: SQL): SQL | undefined {
    if (!config.cursor) {
      return undefined;
    }

    const cursorData = decodeCursor(config.cursor);
    if (!cursorData) {
      return undefined;
    }

    const cursorDate = new Date(cursorData.timestamp);

    return sql`${sortColumn} < ${cursorDate}`;
  }
}
```

---

### 5. Messages Service

**`messages.service.ts`**

```typescript
import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, inArray, not, sql } from 'drizzle-orm';

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
import {
  deletedMessages,
  messageAttachments,
  messageReactions,
  messageReadReceipts,
  messages,
  users,
} from '@/infrastructure/database/schemas';
import { DrizzleDB, Message, MessageAttachment, PublicUser } from '@/infrastructure/database/types';
import { ConversationsService } from './conversations.service';
import { EditMessageDto, SendMessageDto } from './dtos/conversations.dto';
import { MessageReactionGrouped, MessageWithDetails, MessageWithSender } from './types';

@Injectable()
export class MessagesService {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: DrizzleDB,
    private readonly conversationsService: ConversationsService
  ) {}

  // ==================== MESSAGE CRUD ====================

  async sendMessage(
    conversationId: string,
    senderId: string,
    dto: SendMessageDto
  ): Promise<MessageWithDetails> {
    // Verify user is a member
    const isMember = await this.conversationsService.isConversationMember(conversationId, senderId);
    if (!isMember) {
      throw new ForbiddenException('You are not a member of this conversation');
    }

    // Validate replyToId if provided
    if (dto.replyToId) {
      const replyTo = await this.findMessageById(dto.replyToId);
      if (!replyTo || replyTo.conversationId !== conversationId) {
        throw new NotFoundException('Reply message not found in this conversation');
      }
    }

    const messageId = generateUniqueId('msg');
    const now = new Date();

    // Create message
    const [message] = await this.db
      .insert(messages)
      .values({
        id: messageId,
        conversationId,
        senderId,
        content: dto.content ?? null,
        type: dto.type,
        replyToId: dto.replyToId ?? null,
        createdAt: now,
        updatedAt: now,
      })
      .returning();

    // Create attachments if any
    if (dto.attachments && dto.attachments.length > 0) {
      const attachmentRecords = dto.attachments.map(attachment => ({
        id: generateUniqueId('att'),
        messageId,
        ...attachment,
      }));
      await this.db.insert(messageAttachments).values(attachmentRecords);
    }

    // Update conversation's lastMessageAt
    await this.conversationsService.updateLastMessageAt(conversationId, now);

    // Return full message with details
    return this.getMessageWithDetails(messageId, senderId);
  }

  async editMessage(
    conversationId: string,
    messageId: string,
    userId: string,
    dto: EditMessageDto
  ): Promise<MessageWithDetails> {
    const message = await this.findMessageById(messageId);
    if (!message || message.conversationId !== conversationId) {
      throw new NotFoundException('Message not found');
    }

    if (message.senderId !== userId) {
      throw new ForbiddenException('You can only edit your own messages');
    }

    if (message.isDeleted) {
      throw new ForbiddenException('Cannot edit a deleted message');
    }

    const [updated] = await this.db
      .update(messages)
      .set({
        content: dto.content,
        isEdited: true,
        editedAt: new Date(),
        updatedAt: new Date(),
      })
      .where(eq(messages.id, messageId))
      .returning();

    return this.getMessageWithDetails(messageId, userId);
  }

  async deleteMessage(
    conversationId: string,
    messageId: string,
    userId: string,
    forEveryone: boolean = false
  ): Promise<void> {
    const message = await this.findMessageById(messageId);
    if (!message || message.conversationId !== conversationId) {
      throw new NotFoundException('Message not found');
    }

    const isMember = await this.conversationsService.isConversationMember(conversationId, userId);
    if (!isMember) {
      throw new ForbiddenException('You are not a member of this conversation');
    }

    if (forEveryone) {
      // Only sender can delete for everyone
      if (message.senderId !== userId) {
        throw new ForbiddenException('You can only delete your own messages for everyone');
      }

      await this.db
        .update(messages)
        .set({
          isDeleted: true,
          deletedAt: new Date(),
          deletedForEveryone: true,
          content: null,
          updatedAt: new Date(),
        })
        .where(eq(messages.id, messageId));
    } else {
      // Delete for self only
      await this.db.insert(deletedMessages).values({
        id: generateUniqueId('del_msg'),
        messageId,
        userId,
        deletedAt: new Date(),
      });
    }
  }

  async findMessageById(messageId: string): Promise<Message | null> {
    const [result] = await this.db
      .select()
      .from(messages)
      .where(eq(messages.id, messageId))
      .limit(1);
    return result ?? null;
  }

  async getMessageWithDetails(
    messageId: string,
    currentUserId: string
  ): Promise<MessageWithDetails> {
    const [message] = await this.db
      .select({
        id: messages.id,
        conversationId: messages.conversationId,
        senderId: messages.senderId,
        content: messages.content,
        type: messages.type,
        replyToId: messages.replyToId,
        forwaredFromId: messages.forwaredFromId,
        isEdited: messages.isEdited,
        editedAt: messages.editedAt,
        isDeleted: messages.isDeleted,
        deletedAt: messages.deletedAt,
        deletedForEveryone: messages.deletedForEveryone,
        createdAt: messages.createdAt,
        updatedAt: messages.updatedAt,
        metadata: messages.metadata,
        senderName: users.name,
        senderEmail: users.email,
        senderAvatar: users.avatar,
      })
      .from(messages)
      .leftJoin(users, eq(messages.senderId, users.id))
      .where(eq(messages.id, messageId))
      .limit(1);

    if (!message) {
      throw new NotFoundException('Message not found');
    }

    const sender: PublicUser | null = message.senderId
      ? {
          id: message.senderId,
          name: message.senderName!,
          email: message.senderEmail!,
          avatar: message.senderAvatar!,
        }
      : null;

    const attachments = await this.getMessageAttachments(messageId);
    const reactions = await this.getMessageReactionsGrouped(messageId, currentUserId);
    const replyTo = message.replyToId ? await this.getMessageWithSender(message.replyToId) : null;

    return {
      id: message.id,
      conversationId: message.conversationId,
      senderId: message.senderId,
      content: message.content,
      type: message.type,
      replyToId: message.replyToId,
      forwaredFromId: message.forwaredFromId,
      isEdited: message.isEdited,
      editedAt: message.editedAt,
      isDeleted: message.isDeleted,
      deletedAt: message.deletedAt,
      deletedForEveryone: message.deletedForEveryone,
      createdAt: message.createdAt,
      updatedAt: message.updatedAt,
      metadata: message.metadata,
      sender,
      attachments,
      reactions,
      replyTo,
    };
  }

  async getMessageWithSender(messageId: string): Promise<MessageWithSender | null> {
    const [result] = await this.db
      .select({
        id: messages.id,
        conversationId: messages.conversationId,
        senderId: messages.senderId,
        content: messages.content,
        type: messages.type,
        replyToId: messages.replyToId,
        forwaredFromId: messages.forwaredFromId,
        isEdited: messages.isEdited,
        editedAt: messages.editedAt,
        isDeleted: messages.isDeleted,
        deletedAt: messages.deletedAt,
        deletedForEveryone: messages.deletedForEveryone,
        createdAt: messages.createdAt,
        updatedAt: messages.updatedAt,
        metadata: messages.metadata,
        senderName: users.name,
        senderEmail: users.email,
        senderAvatar: users.avatar,
      })
      .from(messages)
      .leftJoin(users, eq(messages.senderId, users.id))
      .where(eq(messages.id, messageId))
      .limit(1);

    if (!result) return null;

    return {
      ...result,
      sender: result.senderId
        ? {
            id: result.senderId,
            name: result.senderName!,
            email: result.senderEmail!,
            avatar: result.senderAvatar!,
          }
        : null,
    };
  }

  async getConversationMessages(
    conversationId: string,
    userId: string,
    pagination: PaginationConfig
  ): Promise<PaginatedResponse<MessageWithDetails>> {
    // Verify user is a member
    const isMember = await this.conversationsService.isConversationMember(conversationId, userId);
    if (!isMember) {
      throw new ForbiddenException('You are not a member of this conversation');
    }

    const sortDirection = getSortDirection(pagination.direction);
    const cursorCondition = buildCursorCondition(pagination, messages.createdAt, messages.id);

    // Get user's deleted messages to exclude
    const userDeletedMessages = this.db
      .select({ messageId: deletedMessages.messageId })
      .from(deletedMessages)
      .where(eq(deletedMessages.userId, userId));

    const conditions = [
      eq(messages.conversationId, conversationId),
      not(inArray(messages.id, userDeletedMessages)),
    ];

    if (cursorCondition) {
      conditions.push(cursorCondition);
    }

    const rows = await this.db
      .select({
        id: messages.id,
        conversationId: messages.conversationId,
        senderId: messages.senderId,
        content: messages.content,
        type: messages.type,
        replyToId: messages.replyToId,
        forwaredFromId: messages.forwaredFromId,
        isEdited: messages.isEdited,
        editedAt: messages.editedAt,
        isDeleted: messages.isDeleted,
        deletedAt: messages.deletedAt,
        deletedForEveryone: messages.deletedForEveryone,
        createdAt: messages.createdAt,
        updatedAt: messages.updatedAt,
        metadata: messages.metadata,
        senderName: users.name,
        senderEmail: users.email,
        senderAvatar: users.avatar,
      })
      .from(messages)
      .leftJoin(users, eq(messages.senderId, users.id))
      .where(and(...conditions))
      .orderBy(sortDirection(messages.createdAt), sortDirection(messages.id))
      .limit(getPaginationLimit(pagination));

    // Fetch attachments and reactions for all messages
    const messageIds = rows.map(r => r.id);
    const attachmentsMap = await this.getAttachmentsForMessages(messageIds);
    const reactionsMap = await this.getReactionsForMessages(messageIds, userId);

    // Fetch reply messages
    const replyToIds = rows.map(r => r.replyToId).filter((id): id is string => id !== null);
    const repliesMap = await this.getMessagesWithSenderByIds(replyToIds);

    const transformedRows: MessageWithDetails[] = rows.map(row => ({
      id: row.id,
      conversationId: row.conversationId,
      senderId: row.senderId,
      content: row.isDeleted && row.deletedForEveryone ? null : row.content,
      type: row.type,
      replyToId: row.replyToId,
      forwaredFromId: row.forwaredFromId,
      isEdited: row.isEdited,
      editedAt: row.editedAt,
      isDeleted: row.isDeleted,
      deletedAt: row.deletedAt,
      deletedForEveryone: row.deletedForEveryone,
      createdAt: row.createdAt,
      updatedAt: row.updatedAt,
      metadata: row.metadata,
      sender: row.senderId
        ? {
            id: row.senderId,
            name: row.senderName!,
            email: row.senderEmail!,
            avatar: row.senderAvatar!,
          }
        : null,
      attachments: attachmentsMap.get(row.id) ?? [],
      reactions: reactionsMap.get(row.id) ?? [],
      replyTo: row.replyToId ? (repliesMap.get(row.replyToId) ?? null) : null,
    }));

    return createPaginatedResponse(
      transformedRows,
      pagination,
      item => item.createdAt,
      item => item.id
    );
  }

  // ==================== REACTIONS ====================

  async addReaction(
    conversationId: string,
    messageId: string,
    userId: string,
    reaction: string
  ): Promise<void> {
    const message = await this.findMessageById(messageId);
    if (!message || message.conversationId !== conversationId) {
      throw new NotFoundException('Message not found');
    }

    const isMember = await this.conversationsService.isConversationMember(conversationId, userId);
    if (!isMember) {
      throw new ForbiddenException('You are not a member of this conversation');
    }

    // Check if already reacted with same emoji
    const [existing] = await this.db
      .select()
      .from(messageReactions)
      .where(
        and(
          eq(messageReactions.messageId, messageId),
          eq(messageReactions.userId, userId),
          eq(messageReactions.reaction, reaction)
        )
      )
      .limit(1);

    if (existing) {
      return; // Already reacted
    }

    await this.db.insert(messageReactions).values({
      id: generateUniqueId('react'),
      messageId,
      userId,
      reaction,
    });
  }

  async removeReaction(
    conversationId: string,
    messageId: string,
    userId: string,
    reaction: string
  ): Promise<void> {
    const message = await this.findMessageById(messageId);
    if (!message || message.conversationId !== conversationId) {
      throw new NotFoundException('Message not found');
    }

    await this.db
      .delete(messageReactions)
      .where(
        and(
          eq(messageReactions.messageId, messageId),
          eq(messageReactions.userId, userId),
          eq(messageReactions.reaction, reaction)
        )
      );
  }

  // ==================== READ RECEIPTS ====================

  async markMessageAsRead(
    conversationId: string,
    messageId: string,
    userId: string
  ): Promise<void> {
    const message = await this.findMessageById(messageId);
    if (!message || message.conversationId !== conversationId) {
      throw new NotFoundException('Message not found');
    }

    const isMember = await this.conversationsService.isConversationMember(conversationId, userId);
    if (!isMember) {
      throw new ForbiddenException('You are not a member of this conversation');
    }

    // Don't create read receipt for own messages
    if (message.senderId === userId) {
      return;
    }

    // Upsert read receipt
    await this.db
      .insert(messageReadReceipts)
      .values({
        id: generateUniqueId('receipt'),
        messageId,
        userId,
        status: 'read',
        readAt: new Date(),
      })
      .onConflictDoUpdate({
        target: [messageReadReceipts.messageId, messageReadReceipts.userId],
        set: {
          status: 'read',
          readAt: new Date(),
        },
      });

    // Also update conversation member's last read
    await this.conversationsService.markAsRead(conversationId, userId, messageId);
  }

  async getMessageReadReceipts(messageId: string): Promise<{ userId: string; readAt: Date }[]> {
    const receipts = await this.db
      .select({
        userId: messageReadReceipts.userId,
        readAt: messageReadReceipts.readAt,
      })
      .from(messageReadReceipts)
      .where(
        and(eq(messageReadReceipts.messageId, messageId), eq(messageReadReceipts.status, 'read'))
      );

    return receipts;
  }

  // ==================== HELPER METHODS ====================

  private async getMessageAttachments(messageId: string): Promise<MessageAttachment[]> {
    return this.db
      .select()
      .from(messageAttachments)
      .where(eq(messageAttachments.messageId, messageId));
  }

  private async getAttachmentsForMessages(
    messageIds: string[]
  ): Promise<Map<string, MessageAttachment[]>> {
    if (messageIds.length === 0) return new Map();

    const attachments = await this.db
      .select()
      .from(messageAttachments)
      .where(inArray(messageAttachments.messageId, messageIds));

    const map = new Map<string, MessageAttachment[]>();
    for (const attachment of attachments) {
      const existing = map.get(attachment.messageId) ?? [];
      existing.push(attachment);
      map.set(attachment.messageId, existing);
    }
    return map;
  }

  private async getMessageReactionsGrouped(
    messageId: string,
    currentUserId: string
  ): Promise<MessageReactionGrouped[]> {
    const reactions = await this.db
      .select({
        reaction: messageReactions.reaction,
        userId: users.id,
        userName: users.name,
        userEmail: users.email,
        userAvatar: users.avatar,
      })
      .from(messageReactions)
      .innerJoin(users, eq(messageReactions.userId, users.id))
      .where(eq(messageReactions.messageId, messageId));

    // Group by reaction
    const grouped = new Map<string, { users: PublicUser[]; hasReacted: boolean }>();

    for (const r of reactions) {
      const existing = grouped.get(r.reaction) ?? { users: [], hasReacted: false };
      existing.users.push({
        id: r.userId,
        name: r.userName,
        email: r.userEmail,
        avatar: r.userAvatar,
      });
      if (r.userId === currentUserId) {
        existing.hasReacted = true;
      }
      grouped.set(r.reaction, existing);
    }

    return Array.from(grouped.entries()).map(([reaction, data]) => ({
      reaction,
      count: data.users.length,
      users: data.users,
      hasReacted: data.hasReacted,
    }));
  }

  private async getReactionsForMessages(
    messageIds: string[],
    currentUserId: string
  ): Promise<Map<string, MessageReactionGrouped[]>> {
    if (messageIds.length === 0) return new Map();

    const reactions = await this.db
      .select({
        messageId: messageReactions.messageId,
        reaction: messageReactions.reaction,
        userId: users.id,
        userName: users.name,
        userEmail: users.email,
        userAvatar: users.avatar,
      })
      .from(messageReactions)
      .innerJoin(users, eq(messageReactions.userId, users.id))
      .where(inArray(messageReactions.messageId, messageIds));

    // Group by messageId, then by reaction
    const messageMap = new Map<string, Map<string, { users: PublicUser[]; hasReacted: boolean }>>();

    for (const r of reactions) {
      if (!messageMap.has(r.messageId)) {
        messageMap.set(r.messageId, new Map());
      }
      const reactionMap = messageMap.get(r.messageId)!;

      const existing = reactionMap.get(r.reaction) ?? { users: [], hasReacted: false };
      existing.users.push({
        id: r.userId,
        name: r.userName,
        email: r.userEmail,
        avatar: r.userAvatar,
      });
      if (r.userId === currentUserId) {
        existing.hasReacted = true;
      }
      reactionMap.set(r.reaction, existing);
    }

    // Convert to final format
    const result = new Map<string, MessageReactionGrouped[]>();
    for (const [messageId, reactionMap] of messageMap) {
      result.set(
        messageId,
        Array.from(reactionMap.entries()).map(([reaction, data]) => ({
          reaction,
          count: data.users.length,
          users: data.users,
          hasReacted: data.hasReacted,
        }))
      );
    }

    return result;
  }

  private async getMessagesWithSenderByIds(
    messageIds: string[]
  ): Promise<Map<string, MessageWithSender>> {
    if (messageIds.length === 0) return new Map();

    const rows = await this.db
      .select({
        id: messages.id,
        conversationId: messages.conversationId,
        senderId: messages.senderId,
        content: messages.content,
        type: messages.type,
        replyToId: messages.replyToId,
        forwaredFromId: messages.forwaredFromId,
        isEdited: messages.isEdited,
        editedAt: messages.editedAt,
        isDeleted: messages.isDeleted,
        deletedAt: messages.deletedAt,
        deletedForEveryone: messages.deletedForEveryone,
        createdAt: messages.createdAt,
        updatedAt: messages.updatedAt,
        metadata: messages.metadata,
        senderName: users.name,
        senderEmail: users.email,
        senderAvatar: users.avatar,
      })
      .from(messages)
      .leftJoin(users, eq(messages.senderId, users.id))
      .where(inArray(messages.id, messageIds));

    const map = new Map<string, MessageWithSender>();
    for (const row of rows) {
      map.set(row.id, {
        ...row,
        sender: row.senderId
          ? {
              id: row.senderId,
              name: row.senderName!,
              email: row.senderEmail!,
              avatar: row.senderAvatar!,
            }
          : null,
      });
    }
    return map;
  }
}
```

---

### 6. Controller

**`conversations.controller.ts`**

```typescript
import {
  Body,
  Controller,
  Delete,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Patch,
  Post,
  Query,
} from '@nestjs/common';

import { CursorPaginationQueryDto } from '@/common/lib/pagination';
import { AuthUser } from '../auth/decorators/auth-user.decorator';
import { AuthenticatedUser } from '../auth/types';
import { ConversationsService } from './conversations.service';
import {
  AddMembersDto,
  AddReactionDto,
  ConversationIdParamDto,
  CreateConversationDto,
  EditMessageDto,
  MemberIdParamDto,
  MessageIdParamDto,
  SendMessageDto,
  UpdateConversationDto,
  UpdateMemberRoleDto,
} from './dtos/conversations.dto';
import { MessagesService } from './messages.service';

@Controller('conversations')
export class ConversationsController {
  constructor(
    private readonly conversationsService: ConversationsService,
    private readonly messagesService: MessagesService
  ) {}

  // ==================== CONVERSATIONS ====================

  @Get()
  @HttpCode(HttpStatus.OK)
  async getConversations(
    @AuthUser() user: AuthenticatedUser,
    @Query() query: CursorPaginationQueryDto
  ) {
    return this.conversationsService.findConversationsByUserId(user.id, query);
  }

  @Post()
  @HttpCode(HttpStatus.CREATED)
  async createConversation(
    @AuthUser() user: AuthenticatedUser,
    @Body() dto: CreateConversationDto
  ) {
    return this.conversationsService.createConversation(user.id, dto);
  }

  @Get(':conversationId')
  @HttpCode(HttpStatus.OK)
  async getConversation(
    @AuthUser() user: AuthenticatedUser,
    @Param() params: ConversationIdParamDto
  ) {
    const conversation = await this.conversationsService.getConversationWithDetails(
      params.conversationId,
      user.id
    );
    if (!conversation) {
      return { error: 'Conversation not found' };
    }
    return conversation;
  }

  @Patch(':conversationId')
  @HttpCode(HttpStatus.OK)
  async updateConversation(
    @AuthUser() user: AuthenticatedUser,
    @Param() params: ConversationIdParamDto,
    @Body() dto: UpdateConversationDto
  ) {
    return this.conversationsService.updateConversation(params.conversationId, user.id, dto);
  }

  @Delete(':conversationId')
  @HttpCode(HttpStatus.OK)
  async deleteConversation(
    @AuthUser() user: AuthenticatedUser,
    @Param() params: ConversationIdParamDto
  ) {
    await this.conversationsService.deleteConversation(params.conversationId, user.id);
    return { message: 'Conversation deleted successfully' };
  }

  // ==================== MEMBERS ====================

  @Get(':conversationId/members')
  @HttpCode(HttpStatus.OK)
  async getConversationMembers(
    @AuthUser() user: AuthenticatedUser,
    @Param() params: ConversationIdParamDto
  ) {
    const isMember = await this.conversationsService.isConversationMember(
      params.conversationId,
      user.id
    );
    if (!isMember) {
      return { error: 'You are not a member of this conversation' };
    }
    return this.conversationsService.getConversationMembers(params.conversationId);
  }

  @Post(':conversationId/members')
  @HttpCode(HttpStatus.CREATED)
  async addMembers(
    @AuthUser() user: AuthenticatedUser,
    @Param() params: ConversationIdParamDto,
    @Body() dto: AddMembersDto
  ) {
    return this.conversationsService.addMembers(params.conversationId, user.id, dto);
  }

  @Delete(':conversationId/members/:memberId')
  @HttpCode(HttpStatus.OK)
  async removeMember(@AuthUser() user: AuthenticatedUser, @Param() params: MemberIdParamDto) {
    await this.conversationsService.removeMember(params.conversationId, user.id, params.memberId);
    return { message: 'Member removed successfully' };
  }

  @Patch(':conversationId/members/:memberId/role')
  @HttpCode(HttpStatus.OK)
  async updateMemberRole(
    @AuthUser() user: AuthenticatedUser,
    @Param() params: MemberIdParamDto,
    @Body() dto: UpdateMemberRoleDto
  ) {
    await this.conversationsService.updateMemberRole(
      params.conversationId,
      user.id,
      params.memberId,
      dto
    );
    return { message: 'Member role updated successfully' };
  }

  @Post(':conversationId/leave')
  @HttpCode(HttpStatus.OK)
  async leaveConversation(
    @AuthUser() user: AuthenticatedUser,
    @Param() params: ConversationIdParamDto
  ) {
    await this.conversationsService.leaveConversation(params.conversationId, user.id);
    return { message: 'Left conversation successfully' };
  }

  // ==================== MESSAGES ====================

  @Get(':conversationId/messages')
  @HttpCode(HttpStatus.OK)
  async getMessages(
    @AuthUser() user: AuthenticatedUser,
    @Param() params: ConversationIdParamDto,
    @Query() query: CursorPaginationQueryDto
  ) {
    return this.messagesService.getConversationMessages(params.conversationId, user.id, query);
  }

  @Post(':conversationId/messages')
  @HttpCode(HttpStatus.CREATED)
  async sendMessage(
    @AuthUser() user: AuthenticatedUser,
    @Param() params: ConversationIdParamDto,
    @Body() dto: SendMessageDto
  ) {
    return this.messagesService.sendMessage(params.conversationId, user.id, dto);
  }

  @Patch(':conversationId/messages/:messageId')
  @HttpCode(HttpStatus.OK)
  async editMessage(
    @AuthUser() user: AuthenticatedUser,
    @Param() params: MessageIdParamDto,
    @Body() dto: EditMessageDto
  ) {
    return this.messagesService.editMessage(params.conversationId, params.messageId, user.id, dto);
  }

  @Delete(':conversationId/messages/:messageId')
  @HttpCode(HttpStatus.OK)
  async deleteMessage(
    @AuthUser() user: AuthenticatedUser,
    @Param() params: MessageIdParamDto,
    @Query('forEveryone') forEveryone?: string
  ) {
    await this.messagesService.deleteMessage(
      params.conversationId,
      params.messageId,
      user.id,
      forEveryone === 'true'
    );
    return { message: 'Message deleted successfully' };
  }

  // ==================== REACTIONS ====================

  @Post(':conversationId/messages/:messageId/reactions')
  @HttpCode(HttpStatus.CREATED)
  async addReaction(
    @AuthUser() user: AuthenticatedUser,
    @Param() params: MessageIdParamDto,
    @Body() dto: AddReactionDto
  ) {
    await this.messagesService.addReaction(
      params.conversationId,
      params.messageId,
      user.id,
      dto.reaction
    );
    return { message: 'Reaction added successfully' };
  }

  @Delete(':conversationId/messages/:messageId/reactions/:reaction')
  @HttpCode(HttpStatus.OK)
  async removeReaction(
    @AuthUser() user: AuthenticatedUser,
    @Param() params: MessageIdParamDto & { reaction: string }
  ) {
    await this.messagesService.removeReaction(
      params.conversationId,
      params.messageId,
      user.id,
      params.reaction
    );
    return { message: 'Reaction removed successfully' };
  }

  // ==================== READ RECEIPTS ====================

  @Post(':conversationId/messages/:messageId/read')
  @HttpCode(HttpStatus.OK)
  async markAsRead(@AuthUser() user: AuthenticatedUser, @Param() params: MessageIdParamDto) {
    await this.messagesService.markMessageAsRead(params.conversationId, params.messageId, user.id);
    return { message: 'Message marked as read' };
  }

  @Get(':conversationId/messages/:messageId/receipts')
  @HttpCode(HttpStatus.OK)
  async getReadReceipts(@AuthUser() user: AuthenticatedUser, @Param() params: MessageIdParamDto) {
    const isMember = await this.conversationsService.isConversationMember(
      params.conversationId,
      user.id
    );
    if (!isMember) {
      return { error: 'You are not a member of this conversation' };
    }
    return this.messagesService.getMessageReadReceipts(params.messageId);
  }
}
```

---

### 7. WebSocket Gateway

**`conversations.gateway.ts`**

```typescript
import { Logger, UseFilters, UsePipes, ValidationPipe } from '@nestjs/common';
import {
  ConnectedSocket,
  MessageBody,
  OnGatewayInit,
  SubscribeMessage,
  WebSocketGateway,
  WebSocketServer,
  WsException,
} from '@nestjs/websockets';
import { Server } from 'socket.io';

import { AuthenticatedSocket } from '@/infrastructure/websockets/types';
import { WebsocketsService } from '@/infrastructure/websockets/websockets.service';
import { ConversationsService } from './conversations.service';
import { MessagesService } from './messages.service';
import {
  CONVERSATION_EVENTS,
  MessageDeletedEvent,
  MessageReadEvent,
  MessageUpdatedEvent,
  NewMessageEvent,
  TypingEvent,
} from './types';

// DTO types for WebSocket messages
interface JoinConversationPayload {
  conversationId: string;
}

interface SendMessagePayload {
  conversationId: string;
  content?: string;
  type?: 'text' | 'image' | 'file' | 'audio' | 'video';
  replyToId?: string;
  attachments?: {
    fileName: string;
    fileUrl: string;
    fileType: string;
    fileSize: number;
    duration?: number;
    thumbnailUrl?: string;
    blurHash?: string;
  }[];
}

interface EditMessagePayload {
  conversationId: string;
  messageId: string;
  content: string;
}

interface DeleteMessagePayload {
  conversationId: string;
  messageId: string;
  forEveryone?: boolean;
}

interface TypingPayload {
  conversationId: string;
}

interface MarkReadPayload {
  conversationId: string;
  messageId: string;
}

interface ReactionPayload {
  conversationId: string;
  messageId: string;
  reaction: string;
}

@WebSocketGateway()
@UsePipes(new ValidationPipe({ transform: true }))
export class ConversationsGateway implements OnGatewayInit {
  private readonly logger = new Logger(ConversationsGateway.name);

  @WebSocketServer()
  server: Server;

  constructor(
    private readonly conversationsService: ConversationsService,
    private readonly messagesService: MessagesService,
    private readonly websocketsService: WebsocketsService
  ) {}

  afterInit(server: Server) {
    this.websocketsService.setServer(server);
    this.logger.log('Conversations Gateway initialized');
  }

  // ==================== ROOM MANAGEMENT ====================

  @SubscribeMessage(CONVERSATION_EVENTS.JOIN_CONVERSATION)
  async handleJoinConversation(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: JoinConversationPayload
  ) {
    const { conversationId } = payload;
    const userId = client.user.id;

    try {
      const isMember = await this.conversationsService.isConversationMember(conversationId, userId);
      if (!isMember) {
        throw new WsException('You are not a member of this conversation');
      }

      client.join(`conversation:${conversationId}`);
      this.logger.debug(`User ${userId} joined conversation ${conversationId}`);

      return { success: true, conversationId };
    } catch (error) {
      this.logger.error(`Error joining conversation: ${error}`);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  @SubscribeMessage(CONVERSATION_EVENTS.LEAVE_CONVERSATION)
  async handleLeaveConversation(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: JoinConversationPayload
  ) {
    const { conversationId } = payload;
    const userId = client.user.id;

    client.leave(`conversation:${conversationId}`);
    this.logger.debug(`User ${userId} left conversation room ${conversationId}`);

    return { success: true };
  }

  // ==================== MESSAGES ====================

  @SubscribeMessage(CONVERSATION_EVENTS.SEND_MESSAGE)
  async handleSendMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: SendMessagePayload
  ) {
    const { conversationId, ...messageData } = payload;
    const userId = client.user.id;

    try {
      const message = await this.messagesService.sendMessage(conversationId, userId, {
        content: messageData.content,
        type: messageData.type ?? 'text',
        replyToId: messageData.replyToId,
        attachments: messageData.attachments,
      });

      const event: NewMessageEvent = {
        conversationId,
        message,
      };

      this.server.to(`conversation:${conversationId}`).emit(CONVERSATION_EVENTS.NEW_MESSAGE, event);

      const memberIds = await this.conversationsService.getConversationMemberIds(conversationId);
      this.websocketsService.sendToUsers(memberIds, CONVERSATION_EVENTS.NEW_MESSAGE, event);

      return { success: true, message };
    } catch (error) {
      this.logger.error(`Error sending message: ${error}`);
      client.emit(CONVERSATION_EVENTS.ERROR, {
        event: CONVERSATION_EVENTS.SEND_MESSAGE,
        error: error instanceof Error ? error.message : 'Failed to send message',
      });
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  @SubscribeMessage(CONVERSATION_EVENTS.EDIT_MESSAGE)
  async handleEditMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: EditMessagePayload
  ) {
    const { conversationId, messageId, content } = payload;
    const userId = client.user.id;

    try {
      const message = await this.messagesService.editMessage(conversationId, messageId, userId, {
        content,
      });

      const event: MessageUpdatedEvent = {
        conversationId,
        message,
      };

      this.server
        .to(`conversation:${conversationId}`)
        .emit(CONVERSATION_EVENTS.MESSAGE_UPDATED, event);

      const memberIds = await this.conversationsService.getConversationMemberIds(conversationId);
      this.websocketsService.sendToUsers(memberIds, CONVERSATION_EVENTS.MESSAGE_UPDATED, event);

      return { success: true, message };
    } catch (error) {
      this.logger.error(`Error editing message: ${error}`);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  @SubscribeMessage(CONVERSATION_EVENTS.DELETE_MESSAGE)
  async handleDeleteMessage(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: DeleteMessagePayload
  ) {
    const { conversationId, messageId, forEveryone = false } = payload;
    const userId = client.user.id;

    try {
      await this.messagesService.deleteMessage(conversationId, messageId, userId, forEveryone);

      if (forEveryone) {
        const event: MessageDeletedEvent = {
          conversationId,
          messageId,
          deletedForEveryone: true,
        };

        this.server
          .to(`conversation:${conversationId}`)
          .emit(CONVERSATION_EVENTS.MESSAGE_DELETED, event);

        const memberIds = await this.conversationsService.getConversationMemberIds(conversationId);
        this.websocketsService.sendToUsers(memberIds, CONVERSATION_EVENTS.MESSAGE_DELETED, event);
      }

      return { success: true };
    } catch (error) {
      this.logger.error(`Error deleting message: ${error}`);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  // ==================== TYPING INDICATORS ====================

  @SubscribeMessage(CONVERSATION_EVENTS.TYPING_START)
  async handleTypingStart(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: TypingPayload
  ) {
    const { conversationId } = payload;
    const user = client.user;

    const event: TypingEvent = {
      conversationId,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar ?? '',
      },
      isTyping: true,
    };

    client.to(`conversation:${conversationId}`).emit(CONVERSATION_EVENTS.USER_TYPING, event);

    return { success: true };
  }

  @SubscribeMessage(CONVERSATION_EVENTS.TYPING_STOP)
  async handleTypingStop(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: TypingPayload
  ) {
    const { conversationId } = payload;
    const user = client.user;

    const event: TypingEvent = {
      conversationId,
      user: {
        id: user.id,
        name: user.name,
        email: user.email,
        avatar: user.avatar ?? '',
      },
      isTyping: false,
    };

    client.to(`conversation:${conversationId}`).emit(CONVERSATION_EVENTS.USER_TYPING, event);

    return { success: true };
  }

  // ==================== READ RECEIPTS ====================

  @SubscribeMessage(CONVERSATION_EVENTS.MARK_READ)
  async handleMarkRead(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: MarkReadPayload
  ) {
    const { conversationId, messageId } = payload;
    const userId = client.user.id;

    try {
      await this.messagesService.markMessageAsRead(conversationId, messageId, userId);

      const event: MessageReadEvent = {
        conversationId,
        messageId,
        userId,
        readAt: new Date(),
      };

      client.to(`conversation:${conversationId}`).emit(CONVERSATION_EVENTS.MESSAGE_READ, event);

      return { success: true };
    } catch (error) {
      this.logger.error(`Error marking message as read: ${error}`);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  // ==================== REACTIONS ====================

  @SubscribeMessage(CONVERSATION_EVENTS.ADD_REACTION)
  async handleAddReaction(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: ReactionPayload
  ) {
    const { conversationId, messageId, reaction } = payload;
    const userId = client.user.id;

    try {
      await this.messagesService.addReaction(conversationId, messageId, userId, reaction);

      const message = await this.messagesService.getMessageWithDetails(messageId, userId);

      const event: MessageUpdatedEvent = {
        conversationId,
        message,
      };

      this.server
        .to(`conversation:${conversationId}`)
        .emit(CONVERSATION_EVENTS.MESSAGE_UPDATED, event);

      return { success: true };
    } catch (error) {
      this.logger.error(`Error adding reaction: ${error}`);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  @SubscribeMessage(CONVERSATION_EVENTS.REMOVE_REACTION)
  async handleRemoveReaction(
    @ConnectedSocket() client: AuthenticatedSocket,
    @MessageBody() payload: ReactionPayload
  ) {
    const { conversationId, messageId, reaction } = payload;
    const userId = client.user.id;

    try {
      await this.messagesService.removeReaction(conversationId, messageId, userId, reaction);

      const message = await this.messagesService.getMessageWithDetails(messageId, userId);

      const event: MessageUpdatedEvent = {
        conversationId,
        message,
      };

      this.server
        .to(`conversation:${conversationId}`)
        .emit(CONVERSATION_EVENTS.MESSAGE_UPDATED, event);

      return { success: true };
    } catch (error) {
      this.logger.error(`Error removing reaction: ${error}`);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  }

  // ==================== UTILITY METHODS ====================

  async notifyMemberJoined(conversationId: string, member: any) {
    const memberIds = await this.conversationsService.getConversationMemberIds(conversationId);
    this.websocketsService.sendToUsers(memberIds, CONVERSATION_EVENTS.MEMBER_JOINED, {
      conversationId,
      member,
    });
  }

  async notifyMemberLeft(conversationId: string, userId: string) {
    const memberIds = await this.conversationsService.getConversationMemberIds(conversationId);
    this.websocketsService.sendToUsers(memberIds, CONVERSATION_EVENTS.MEMBER_LEFT, {
      conversationId,
      userId,
      leftAt: new Date(),
    });
  }

  async notifyConversationUpdated(
    conversationId: string,
    updates: { name?: string; description?: string | null; avatarUrl?: string | null }
  ) {
    const memberIds = await this.conversationsService.getConversationMemberIds(conversationId);
    this.websocketsService.sendToUsers(memberIds, CONVERSATION_EVENTS.CONVERSATION_UPDATED, {
      conversationId,
      updates,
    });
  }
}
```

---

### 8. Index Exports

**`index.ts`**

```typescript
// Module
export { ConversationsModule } from './conversations.module';

// Services
export { ConversationsService } from './conversations.service';
export { MessagesService } from './messages.service';

// Gateway
export { ConversationsGateway } from './conversations.gateway';

// Types
export * from './types';

// DTOs
export * from './dtos/conversations.dto';
```

---

## API Reference

### REST Endpoints

| Method   | Endpoint                                                 | Description                 |
| -------- | -------------------------------------------------------- | --------------------------- |
| `GET`    | `/conversations`                                         | Get paginated conversations |
| `POST`   | `/conversations`                                         | Create conversation         |
| `GET`    | `/conversations/:id`                                     | Get conversation details    |
| `PATCH`  | `/conversations/:id`                                     | Update conversation         |
| `DELETE` | `/conversations/:id`                                     | Delete conversation         |
| `GET`    | `/conversations/:id/members`                             | Get members                 |
| `POST`   | `/conversations/:id/members`                             | Add members                 |
| `DELETE` | `/conversations/:id/members/:memberId`                   | Remove member               |
| `PATCH`  | `/conversations/:id/members/:memberId/role`              | Update role                 |
| `POST`   | `/conversations/:id/leave`                               | Leave conversation          |
| `GET`    | `/conversations/:id/messages`                            | Get messages                |
| `POST`   | `/conversations/:id/messages`                            | Send message                |
| `PATCH`  | `/conversations/:id/messages/:msgId`                     | Edit message                |
| `DELETE` | `/conversations/:id/messages/:msgId`                     | Delete message              |
| `POST`   | `/conversations/:id/messages/:msgId/reactions`           | Add reaction                |
| `DELETE` | `/conversations/:id/messages/:msgId/reactions/:reaction` | Remove reaction             |
| `POST`   | `/conversations/:id/messages/:msgId/read`                | Mark as read                |
| `GET`    | `/conversations/:id/messages/:msgId/receipts`            | Get read receipts           |

---

## WebSocket Events

### Client → Server

| Event                | Description             |
| -------------------- | ----------------------- |
| `conversation:join`  | Join conversation room  |
| `conversation:leave` | Leave conversation room |
| `message:send`       | Send message            |
| `message:edit`       | Edit message            |
| `message:delete`     | Delete message          |
| `typing:start`       | Start typing            |
| `typing:stop`        | Stop typing             |
| `message:read`       | Mark as read            |
| `reaction:add`       | Add reaction            |
| `reaction:remove`    | Remove reaction         |

### Server → Client

| Event                  | Description          |
| ---------------------- | -------------------- |
| `message:new`          | New message          |
| `message:updated`      | Message updated      |
| `message:deleted`      | Message deleted      |
| `user:typing`          | Typing indicator     |
| `message:read:update`  | Read receipt         |
| `member:joined`        | Member joined        |
| `member:left`          | Member left          |
| `conversation:updated` | Conversation updated |
| `error`                | Error occurred       |

---

## Usage Examples

### WebSocket Connection

```typescript
import { io } from 'socket.io-client';

const socket = io('ws://localhost:3000', {
  auth: { token: 'your-jwt-token' },
});

// Join conversation
socket.emit('conversation:join', { conversationId: 'conv_abc123' });

// Listen for messages
socket.on('message:new', event => {
  console.log('New message:', event.message);
});

// Send message
socket.emit('message:send', {
  conversationId: 'conv_abc123',
  content: 'Hello!',
  type: 'text',
});

// Typing indicator
socket.emit('typing:start', { conversationId: 'conv_abc123' });
```

### REST API

```bash
# Create direct conversation
curl -X POST /api/conversations \
  -H "Authorization: Bearer <token>" \
  -d '{"type": "direct", "memberIds": ["user_123"]}'

# Send message
curl -X POST /api/conversations/conv_abc/messages \
  -H "Authorization: Bearer <token>" \
  -d '{"content": "Hello!", "type": "text"}'

# Get messages with pagination
curl "/api/conversations/conv_abc/messages?limit=20&direction=desc"
```
