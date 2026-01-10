import { createZodDto } from 'nestjs-zod';
import z from 'zod';

import { cursorPaginationQuerySchema } from '@/common/lib/pagination';
import { insertFriendRequestSchema } from '@/infrastructure/database/schema.zod';

export class SendFriendRequestDto extends createZodDto(insertFriendRequestSchema) {}

export class FriendRequestIdParamDto extends createZodDto(
  z.object({
    requestId: z.string().min(1, { message: 'Request ID is required' }),
  })
) {}

export class FriendIdParamDto extends createZodDto(
  z.object({
    friendId: z.string().min(1, { message: 'Friend ID is required' }),
  })
) {}
