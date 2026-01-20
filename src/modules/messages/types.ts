import {
  Message,
  MessageAttachment,
  MessageReaction,
  PublicUser,
} from '@/infrastructure/database/types';

export type MessageWithSender = Message & {
  sender: PublicUser | null;
};

export type MessageWithDetails = Message & {
  sender: PublicUser | null;
  attachments: MessageAttachment[];
  reactions: MessageReactionGrouped[];
  replyTo: MessageWithSender | null;
};

export type MessageWithReactions = Message & {
  sender: PublicUser | null;
  attachments: MessageAttachment[];
  reactions: MessageReactionGrouped[];
  replyTo: MessageWithSender | null;
};

export type MessageReactionGrouped = {
  reaction: string;
  count: number;
  users: PublicUser[];
  hasReacted: boolean; // whether the current user has reacted to the message
};
