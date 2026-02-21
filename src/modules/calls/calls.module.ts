import { Module } from '@nestjs/common';

import { RedisModule } from '@/infrastructure/redis/redis.module';
import { CallsService } from './calls.service';

@Module({
  imports: [RedisModule],
  providers: [CallsService],
  exports: [CallsService],
})
export class CallsModule {}
