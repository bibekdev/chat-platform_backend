import { Global, Inject, Logger, Module, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import Redis from 'ioredis';

import { REDIS_CLIENT } from '@/common/constants/redis.constants';
import { RedisService } from './redis.service';
import { SessionCacheService } from './session-cache.service';

@Global()
@Module({
  providers: [
    {
      provide: REDIS_CLIENT,
      inject: [ConfigService],
      useFactory: async (configService: ConfigService): Promise<Redis> => {
        const logger = new Logger(REDIS_CLIENT);

        const redis = new Redis({
          host: configService.getOrThrow<string>('REDIS_HOST'),
          port: configService.getOrThrow<number>('REDIS_PORT'),
          retryStrategy: times => {
            if (times > 3) {
              logger.error('Redis connection failed after 3 attempts');
              return null;
            }
            return Math.min(times * 200, 2000);
          },
          maxRetriesPerRequest: 3,
          enableReadyCheck: true,
          lazyConnect: false,
        });

        redis.on('connect', () => {
          logger.log('✅ Redis client connected');
        });

        redis.on('error', error => {
          logger.error(`Redis error: ${error.message}`);
        });

        redis.on('close', () => {
          logger.warn('Redis connection closed');
        });

        try {
          await redis.ping();
          logger.log('✅ Redis connection verified');
        } catch (error) {
          logger.error('Failed to connect to Redis', error);
        }

        return redis;
      },
    },
    RedisService,
    SessionCacheService,
  ],
  exports: [REDIS_CLIENT, RedisService, SessionCacheService],
})
export class RedisModule implements OnModuleDestroy {
  private readonly logger = new Logger(RedisModule.name);

  constructor(@Inject(REDIS_CLIENT) private readonly redisClient: Redis) {}

  // Graceful shutdown
  async onModuleDestroy() {
    this.logger.log('Closing Redis client...');
    await this.redisClient.quit();
    this.logger.log('Redis client closed');
  }
}
