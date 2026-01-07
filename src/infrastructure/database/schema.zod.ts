import { createInsertSchema, createUpdateSchema } from 'drizzle-zod';
import { z } from 'zod';

import * as schemas from './schemas';

export const insertUserSchema = createInsertSchema(schemas.users, {
  name: z.string().min(1, { message: 'Name is required' }),
  email: z.email({ message: 'Invalid email address' }),
  password: z.string().min(8, { message: 'Password must be at least 8 characters long' }),
  avatar: z.string().optional(),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  avatar: true,
});

export const updateUserSchema = createUpdateSchema(schemas.users).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
});

export const insertFriendRequestSchema = createInsertSchema(schemas.friendRequests, {
  receiverId: z.string().min(1, { message: 'Receiver ID is required' }),
}).omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  status: true,
  senderId: true,
});
