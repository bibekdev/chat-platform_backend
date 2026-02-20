import {
  BadRequestException,
  ForbiddenException,
  Inject,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { and, eq, getTableColumns, inArray, isNotNull, not, or, sql, SQL } from 'drizzle-orm';
import { alias } from 'drizzle-orm/pg-core';

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
        throw new BadRequestException('Group conversations must have at least one member');
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
        id: generateUniqueId('conv_member'),
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
    // Find a direct conversation where both users are members
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
    const result = await this.db
      .select()
      .from(conversations)
      .where(eq(conversations.id, conversationId))
      .limit(1);
    return result[0];
  }

  async findConversationsByUserId(
    userId: string,
    pagination: PaginationConfig
  ): Promise<PaginatedResponse<ConversationWithLastMessage>> {
    const sortColumn = sql`COALESCE(${conversations.lastMessageAt}, ${conversations.createdAt})`;

    const cursorCondition = this.buildCoalesceCursorCondition(pagination, sortColumn);

    const conditions = [
      eq(conversationMembers.userId, userId),
      sql`${conversationMembers.leftAt} IS NULL`,
    ];

    if (cursorCondition) {
      conditions.push(cursorCondition);
    }

    // Aliases for getting the other participant in direct messages
    const otherMember = alias(conversationMembers, 'otherMember');
    const otherUser = alias(users, 'otherUser');

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
        // Other participant for direct messages
        otherParticipantId: otherUser.id,
        otherParticipantName: otherUser.name,
        otherParticipantEmail: otherUser.email,
        otherParticipantAvatar: otherUser.avatar,
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
      // Join to get the other participant for direct messages
      .leftJoin(
        otherMember,
        and(
          eq(otherMember.conversationId, conversations.id),
          not(eq(otherMember.userId, userId)),
          eq(conversations.type, 'direct')
        )
      )
      .leftJoin(otherUser, eq(otherUser.id, otherMember.userId))
      .where(and(...conditions))
      .orderBy(sql`${sortColumn} DESC`)
      .limit(getPaginationLimit(pagination));

    // Batch-fetch member avatars for group conversations(up to 4 per group)
    const groupIds = rows.filter(r => r.type === 'group').map(r => r.id);
    const memberAvatarMap = new Map<string, Array<{ avatar: string; name: string }>>();

    if (groupIds.length > 0) {
      const memberRows = await this.db
        .select({
          conversationId: conversationMembers.conversationId,
          avatar: users.avatar,
          name: users.name,
        })
        .from(conversationMembers)
        .innerJoin(users, eq(conversationMembers.userId, users.id))
        .where(
          and(
            inArray(conversationMembers.conversationId, groupIds),
            sql`${conversationMembers.leftAt} IS NULL`
          )
        );

      for (const row of memberRows) {
        const existing = memberAvatarMap.get(row.conversationId) ?? [];
        if (existing.length < 4) {
          existing.push({ avatar: row.avatar, name: row.name });
        }
        memberAvatarMap.set(row.conversationId, existing);
      }
    }

    const conversationIds = rows.map(r => r.id);
    const unreadCountMap = await this.getUnreadCountsForConversations(conversationIds, userId);

    const transformedRows: ConversationWithLastMessage[] = rows.map(row => ({
      id: row.id,
      type: row.type,
      name: row.type === 'direct' && row.otherParticipantName ? row.otherParticipantName : row.name,
      description: row.description,
      avatarUrl:
        row.type === 'direct' && row.otherParticipantAvatar
          ? row.otherParticipantAvatar
          : row.avatarUrl,
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
      otherParticipant:
        row.type === 'direct' && row.otherParticipantId
          ? {
              id: row.otherParticipantId,
              name: row.otherParticipantName!,
              email: row.otherParticipantEmail!,
              avatar: row.otherParticipantAvatar!,
            }
          : null,
      memberAvatars: row.type === 'group' ? (memberAvatarMap.get(row.id) ?? []) : [],
      unreadCount: unreadCountMap.get(row.id) ?? 0,
    }));

    return createPaginatedResponse(
      transformedRows,
      pagination,
      item => item.lastMessageAt ?? item.createdAt,
      item => item.id
    );
  }

  async getConversationWithMembers(
    conversationId: string,
    userId: string
  ): Promise<ConversationWithMembers | null> {
    const isMember = await this.isConversationMember(conversationId, userId);
    if (!isMember) {
      throw new ForbiddenException('You are not a member of this conversation');
    }

    const otherMember = alias(conversationMembers, 'otherMember');
    const otherUser = alias(users, 'otherUser');

    const [conversation] = await this.db
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
        otherParticipantId: otherUser.id,
        otherParticipantName: otherUser.name,
        otherParticipantEmail: otherUser.email,
        otherParticipantAvatar: otherUser.avatar,
      })
      .from(conversations)
      .leftJoin(
        otherMember,
        and(
          eq(otherMember.conversationId, conversations.id),
          not(eq(otherMember.userId, userId)),
          sql`${otherMember.leftAt} IS NULL`
        )
      )
      .leftJoin(otherUser, eq(otherUser.id, otherMember.userId))
      .where(eq(conversations.id, conversationId))
      .limit(1);

    if (!conversation) {
      return null;
    }

    const members = await this.getConversationMembers(conversationId);

    const transformedConversation = {
      id: conversation.id,
      type: conversation.type,
      name:
        conversation.type === 'direct' && conversation.otherParticipantName
          ? conversation.otherParticipantName
          : conversation.name,
      avatarUrl:
        conversation.type === 'direct' && conversation.otherParticipantAvatar
          ? conversation.otherParticipantAvatar
          : conversation.avatarUrl,
      createdBy: conversation.createdBy,
      description: conversation.description,
      lastMessageAt: conversation.lastMessageAt,
      createdAt: conversation.createdAt,
      updatedAt: conversation.updatedAt,
    };

    return {
      ...transformedConversation,
      members,
    };
  }

  async getConversationWithDetails(
    conversationId: string,
    userId: string
  ): Promise<ConversationWithDetails | null> {
    const conversation = await this.getConversationWithMembers(conversationId, userId);
    if (!conversation) {
      return null;
    }

    // Get last message
    const lastMessage = await this.getLastMessage(conversationId);

    // Get unread message count
    const unreadCount = await this.getUnreadMessageCount(conversationId, userId);

    // Get other participant

    return {
      ...conversation,
      lastMessage,
      unreadCount,
    };
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
      throw new ForbiddenException('You are not authorized to update this conversation');
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

    await this.db.delete(conversations).where(eq(conversations.id, conversationId));

    if (conversation.type === 'group') {
      if (conversation.createdBy === userId) {
        await this.db.delete(conversations).where(eq(conversations.id, conversationId));
      } else {
        throw new ForbiddenException('You are not the owner of this conversation');
      }
    }
  }

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
    return !!member;
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
      throw new BadRequestException('Direct conversations cannot have members');
    }

    // Check if user is owner or admin
    const member = await this.getConversationMember(conversationId, userId);
    if (!member || (member.role !== 'owner' && member.role !== 'admin')) {
      throw new ForbiddenException('You are not authorized to add members to this conversation');
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
      id: generateUniqueId('conv_member'),
      conversationId,
      userId: memberId,
      role: 'member' as const,
    }));

    await this.db.insert(conversationMembers).values(memberRecords);

    // Return the newly added members with user info
    const conversationMemberColumns = getTableColumns(conversationMembers);
    const addedMembers = await this.db
      .select({
        ...conversationMemberColumns,
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

    if (memberToRemove.role === 'admin' && actingMember.role !== 'owner') {
      throw new ForbiddenException(
        'You are not authorized to remove admins from this conversation'
      );
    }

    if (actingMember.role === 'member' && userId !== memberIdToRemove) {
      throw new ForbiddenException('Members can only remove themselves');
    }

    // soft delete - set leftAt
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

    // If owner is leaving, transfer ownership to another member or delete the conversation
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
        await this.db
          .update(conversationMembers)
          .set({ role: 'owner' as const })
          .where(eq(conversationMembers.id, otherMembers[0].id));
      } else {
        await this.db.delete(conversations).where(eq(conversations.id, conversationId));
        return;
      }
    }

    // Soft delete - set leftAt
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
      throw new ForbiddenException('You are not authorized to update roles in this conversation');
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
      .set({ lastMessageReadId: messageId, lastReadAt: new Date() })
      .where(
        and(
          eq(conversationMembers.conversationId, conversationId),
          eq(conversationMembers.userId, userId)
        )
      );
  }

  private async getLastMessage(conversationId: string) {
    const [result] = await this.db
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

    if (!result) {
      return null;
    }

    return {
      id: result.id,
      content: result.content,
      type: result.type,
      createdAt: result.createdAt,
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

  private async getUnreadCountsForConversations(
    conversationIds: string[],
    userId: string
  ): Promise<Map<string, number>> {
    if (conversationIds.length === 0) return new Map();

    const results = await this.db
      .select({
        conversationId: messages.conversationId,
        count: sql<number>`COUNT(*)`,
      })
      .from(messages)
      .innerJoin(
        conversationMembers,
        and(
          eq(conversationMembers.conversationId, messages.conversationId),
          eq(conversationMembers.userId, userId)
        )
      )
      .where(
        and(
          inArray(messages.conversationId, conversationIds),
          not(eq(messages.senderId, userId)),
          isNotNull(messages.senderId),
          or(
            sql`${conversationMembers.lastReadAt} IS NULL`,
            sql`${messages.createdAt} > ${conversationMembers.lastReadAt}`
          )
        )
      )
      .groupBy(messages.conversationId);

    const map = new Map<string, number>();
    for (const r of results) {
      map.set(r.conversationId, Number(r.count));
    }
    return map;
  }

  private async getUnreadMessageCount(conversationId: string, userId: string): Promise<number> {
    const member = await this.getConversationMember(conversationId, userId);
    if (!member || !member.lastReadAt) {
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
