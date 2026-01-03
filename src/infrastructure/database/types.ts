import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import z from 'zod';

import { insertUserSchema, updateUserSchema } from '@/infrastructure/database/schema.zod';
import * as schemas from '@/infrastructure/database/schemas';

export type DrizzleDB = NodePgDatabase<typeof schemas>;

export type User = typeof schemas.users.$inferSelect;
export type RefreshToken = typeof schemas.refreshTokens.$inferSelect;

export type InsertUser = z.infer<typeof insertUserSchema>;
export type UpdateUser = z.infer<typeof updateUserSchema>;
