import { ForbiddenException, Inject, Injectable, NotFoundException } from '@nestjs/common';
import { and, eq, getTableColumns, inArray, not } from 'drizzle-orm';

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
import { ConversationsService } from '../conversations/conversations.service';
import { EditMessageDto, SendMessageDto } from './dtos/messages.dto';
import { MessageReactionGrouped, MessageWithDetails, MessageWithSender } from './types';

@Injectable()
export class MessagesService {
  constructor(
    @Inject(DATABASE_CONNECTION) private readonly db: DrizzleDB,
    private readonly conversationsService: ConversationsService
  ) {}

  async sendMessage(
    conversationId: string,
    senderId: string,
    dto: SendMessageDto
  ): Promise<MessageWithDetails> {
    const isMember = await this.conversationsService.isConversationMember(conversationId, senderId);
    if (!isMember) {
      throw new NotFoundException('You are not a member of this conversation');
    }

    // Validate replyToId if provided
    if (dto.replyToId) {
      const replyTo = await this.findMessageById(dto.replyToId);
      if (!replyTo || replyTo.conversationId !== conversationId) {
        throw new NotFoundException('Reply message not found in this converssation');
      }
    }

    const messageId = generateUniqueId('msg');
    const now = new Date();

    await this.db.insert(messages).values({
      id: messageId,
      conversationId,
      senderId,
      content: dto.content ?? null,
      type: dto.type,
      replyToId: dto.replyToId ?? null,
      createdAt: now,
      updatedAt: now,
    });

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
    return result;
  }

  async getMessageWithDetails(
    messageId: string,
    currentUserId: string
  ): Promise<MessageWithDetails> {
    const messageColumns = getTableColumns(messages);

    const [message] = await this.db
      .select({
        ...messageColumns,
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
      forwardedFromId: message.forwardedFromId,
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
    const messageColumns = getTableColumns(messages);
    const [message] = await this.db
      .select({
        ...messageColumns,
        senderName: users.name,
        senderEmail: users.email,
        senderAvatar: users.avatar,
      })
      .from(messages)
      .leftJoin(users, eq(messages.senderId, users.id))
      .where(eq(messages.id, messageId))
      .limit(1);

    if (!message) return null;

    const sender: PublicUser | null = message.senderId
      ? {
          id: message.senderId,
          name: message.senderName!,
          email: message.senderEmail!,
          avatar: message.senderAvatar!,
        }
      : null;

    return {
      id: message.id,
      conversationId: message.conversationId,
      senderId: message.senderId,
      content: message.content,
      type: message.type,
      replyToId: message.replyToId,
      forwardedFromId: message.forwardedFromId,
      isEdited: message.isEdited,
      editedAt: message.editedAt,
      isDeleted: message.isDeleted,
      deletedAt: message.deletedAt,
      deletedForEveryone: message.deletedForEveryone,
      createdAt: message.createdAt,
      updatedAt: message.updatedAt,
      metadata: message.metadata,
      sender,
    };
  }

  async getConversationMessages(
    conversationId: string,
    userId: string,
    pagination: PaginationConfig
  ): Promise<PaginatedResponse<MessageWithDetails>> {
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
        forwardedFromId: messages.forwardedFromId,
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
    const messageIds = rows.map(row => row.id);
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
      forwardedFromId: row.forwardedFromId,
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

    // Check if user already reacted with same emoji
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
      return;
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
        forwardedFromId: messages.forwardedFromId,
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
