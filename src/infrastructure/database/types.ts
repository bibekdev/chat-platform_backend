import { NodePgDatabase } from 'drizzle-orm/node-postgres';
import z from 'zod';

import { insertUserSchema, updateUserSchema } from './schema.zod';
import * as schemas from './schemas';

export type DrizzleDB = NodePgDatabase<typeof schemas>;

export type InsertUser = z.infer<typeof insertUserSchema>;
export type UpdateUser = z.infer<typeof updateUserSchema>;
