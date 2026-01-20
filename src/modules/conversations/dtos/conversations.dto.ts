import { createZodDto } from 'nestjs-zod';
import z from 'zod';

import {
  insertConversationSchema,
  updateConversationSchema,
} from '@/infrastructure/database/schema.zod';

export class CreateConversationDto extends createZodDto(
  insertConversationSchema
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
    )
) {}

export class UpdateConversationDto extends createZodDto(updateConversationSchema) {}

export const addMembersSchema = z.object({ memberIds: z.array(z.string().min(1).max(50)) });

export class AddMembersDto extends createZodDto(addMembersSchema) {}

export const updateMemberRoleSchema = z.object({
  role: z.enum(['admin', 'member']),
});

export class UpdateMemberRoleDto extends createZodDto(updateMemberRoleSchema) {}

export const conversationIdParamSchema = z.object({ conversationId: z.string().min(1).max(50) });

export class ConversationIdParamDto extends createZodDto(conversationIdParamSchema) {}

export class ConversationWithMemberIdParamDto extends createZodDto(
  conversationIdParamSchema.extend({ memberId: z.string().min(1).max(50) })
) {}
