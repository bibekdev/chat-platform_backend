import { Logger } from '@nestjs/common';
import z from 'zod';

const envSchema = z.object({
  PORT: z.coerce.number(),
  NODE_ENV: z.enum(['development', 'production', 'test']).default('development'),
  DATABASE_URL: z.string(),
  REDIS_HOST: z.string(),
  REDIS_PORT: z.coerce.number(),
  JWT_REFRESH_SECRET: z.string(),
  JWT_REFRESH_EXPIRES_IN: z.string(),
  JWT_ACCESS_SECRET: z.string(),
  JWT_ACCESS_EXPIRES_IN: z.string(),
});

export const validateEnv = (config: NodeJS.ProcessEnv) => {
  const logger = new Logger('EnvValidation');
  const result = envSchema.safeParse(config);

  if (!result.success) {
    const errors = result.error.issues
      .map(issue => `  → ${issue.path.join('.')}: ${issue.message}`)
      .join('\n');

    logger.error(`Environment validation failed:\n${errors}`);
    throw new Error('Invalid environment configuration');
  }

  return result.data;
};
