import { createZodDto } from 'nestjs-zod';
import z from 'zod';

export const sendMessageSchema = z.object({
  content: z.string().min(1).max(4000).optional(),
  type: z.enum(['text', 'image', 'file', 'audio', 'video']).default('text'),
  replyToId: z.string().optional(),
  attachments: z
    .array(
      z.object({
        fileName: z.string().min(1).max(255),
        fileUrl: z.url(),
        fileType: z.string().min(1).max(100),
        fileSize: z.number().positive(),
        duration: z.number().positive().optional(),
        thumbnailUrl: z.string().url().optional(),
        blurHash: z.string().optional(),
      })
    )
    .optional(),
});

export const editMessageSchema = z.object({
  content: z.string().min(1).max(4000),
});

export class SendMessageDto extends createZodDto(sendMessageSchema) {}
export class EditMessageDto extends createZodDto(editMessageSchema) {}
