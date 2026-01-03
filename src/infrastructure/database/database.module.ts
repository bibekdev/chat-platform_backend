import { Global, Inject, Logger, Module, OnModuleDestroy } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { drizzle } from 'drizzle-orm/node-postgres';
import { Pool } from 'pg';

import { DATABASE_CONNECTION, DATABASE_POOL } from '@/infrastructure/database/constants';
import { DrizzleDB } from '@/infrastructure/database/types';

@Global()
@Module({
  providers: [
    {
      provide: DATABASE_POOL,
      inject: [ConfigService],
      useFactory: async (ConfigService: ConfigService) => {
        const logger = new Logger(DATABASE_POOL);

        const pool = new Pool({
          connectionString: ConfigService.getOrThrow<string>('DATABASE_URL'),
          max: 20,
          idleTimeoutMillis: 30000,
          connectionTimeoutMillis: 10000,
        });

        pool.on('error', err => {
          logger.error('Unexpected error on idle client', err);
        });

        pool.on('connect', () => {
          logger.debug('New client connected to pool');
        });

        try {
          const client = await pool.connect();
          logger.log('✅ Database connection established successfully');
          client.release();
        } catch (error) {
          logger.error('Failed to connect to database', error);
          throw error;
        }

        return pool;
      },
    },

    {
      provide: DATABASE_CONNECTION,
      inject: [DATABASE_POOL],
      useFactory: (pool: Pool): DrizzleDB => {
        return drizzle(pool);
      },
    },
  ],
  exports: [DATABASE_CONNECTION, DATABASE_POOL],
})
export class DatabaseModule implements OnModuleDestroy {
  private readonly logger = new Logger(DatabaseModule.name);

  constructor(@Inject(DATABASE_POOL) private readonly pool: Pool) {}

  async onModuleDestroy() {
    this.logger.log('Closing database pool...');
    await this.pool.end();
    this.logger.log('Database pool closed');
  }
}
