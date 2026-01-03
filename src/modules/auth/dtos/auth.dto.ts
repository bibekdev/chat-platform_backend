import { createZodDto } from 'nestjs-zod';
import z from 'zod';

import { insertUserSchema } from '@/infrastructure/database/schema.zod';

export class RegisterDto extends createZodDto(insertUserSchema) {}

export class LoginDto extends createZodDto(
  insertUserSchema.pick({ email: true, password: true })
) {}

export class RefreshTokenDto extends createZodDto(
  z.object({
    refreshToken: z.string(),
  })
) {}
