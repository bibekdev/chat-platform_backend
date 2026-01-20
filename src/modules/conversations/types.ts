import { Conversation, ConversationMember, PublicUser } from '@/infrastructure/database/types';

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

export type ConversationMemberWithUser = ConversationMember & { user: PublicUser };

export type ConversationWithMembers = Conversation & { members: ConversationMemberWithUser[] };

export type ConversationWithDetails = Conversation & {
  members: ConversationMemberWithUser[];
  lastMessage: LastMessageWithSender | null;
  unreadCount?: number;
};

export type DirectConversationInfo = ConversationWithLastMessage & {
  otherParticipant: PublicUser;
};
