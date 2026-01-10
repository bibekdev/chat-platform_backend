import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import z from 'zod';

import {
  insertFriendRequestSchema,
  insertUserSchema,
  updateUserSchema,
} from '@/infrastructure/database/schema.zod';
import * as schemas from '@/infrastructure/database/schemas';

export type DrizzleDB = NodePgDatabase<typeof schemas>;

export type User = typeof schemas.users.$inferSelect;
export type RefreshToken = typeof schemas.refreshTokens.$inferSelect;
export type FriendRequest = typeof schemas.friendRequests.$inferSelect;
export type Friend = typeof schemas.friends.$inferSelect;

export type PublicUser = Pick<User, 'id' | 'name' | 'email' | 'avatar'>;
export type FriendRequestWithSender = FriendRequest & { sender: PublicUser };
export type FriendRequestWithReceiver = FriendRequest & { receiver: PublicUser };

export type Conversation = typeof schemas.conversations.$inferSelect;
export type ConversationMember = typeof schemas.conversationMembers.$inferSelect;
export type Message = typeof schemas.messages.$inferSelect;
export type MessageAttachment = typeof schemas.messageAttachments.$inferSelect;
export type MessageReaction = typeof schemas.messageReactions.$inferSelect;
export type DeletedMessage = typeof schemas.deletedMessages.$inferSelect;
export type MessageReadReceipt = typeof schemas.messageReadReceipts.$inferSelect;

export type InsertUser = z.infer<typeof insertUserSchema>;
export type UpdateUser = z.infer<typeof updateUserSchema>;
export type InsertFriendRequest = z.infer<typeof insertFriendRequestSchema>;
