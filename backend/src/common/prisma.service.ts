import { Injectable, OnModuleDestroy, OnModuleInit } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { loadEnv } from '../config/env';

/** One pg pool shared by Prisma (driver adapter) and the session store, so the connection budget is explicit. */
export function createPool(): Pool {
  const env = loadEnv();
  return new Pool({ connectionString: env.databaseUrl, max: env.dbPoolMax, idleTimeoutMillis: 30_000, connectionTimeoutMillis: 5_000 });
}

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  readonly pool: Pool;

  constructor() {
    const pool = createPool();
    super({ adapter: new PrismaPg(pool) });
    this.pool = pool;
  }

  async onModuleInit() {
    await this.$connect();
  }

  async onModuleDestroy() {
    await this.$disconnect();
    await this.pool.end().catch(() => undefined);
  }
}
