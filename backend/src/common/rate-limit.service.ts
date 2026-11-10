import { Injectable } from '@nestjs/common';
import { Prisma } from '@prisma/client';
import { PrismaService } from './prisma.service';

export interface RateResult { allowed: boolean; count: number; retryAfterSec: number }

/**
 * Fixed-window rate limiter whose state lives in PostgreSQL, so every API instance shares the same counters
 * (an in-memory limiter would silently multiply the limit by the number of replicas). One atomic UPSERT per hit.
 */
@Injectable()
export class RateLimitService {
  constructor(private readonly prisma: PrismaService) {}

  async hit(key: string, limit: number, windowSec: number): Promise<RateResult> {
    const rows = await this.prisma.$queryRaw<{ count: number; age: number }[]>(Prisma.sql`
      INSERT INTO "RateLimit" ("key", "count", "windowStart") VALUES (${key}, 1, now())
      ON CONFLICT ("key") DO UPDATE SET
        "count" = CASE WHEN "RateLimit"."windowStart" < now() - make_interval(secs => ${windowSec}::double precision) THEN 1 ELSE "RateLimit"."count" + 1 END,
        "windowStart" = CASE WHEN "RateLimit"."windowStart" < now() - make_interval(secs => ${windowSec}::double precision) THEN now() ELSE "RateLimit"."windowStart" END
      RETURNING "count", EXTRACT(EPOCH FROM (now() - "windowStart"))::float8 AS age`);
    const { count, age } = rows[0];
    return { allowed: count <= limit, count, retryAfterSec: Math.max(1, Math.ceil(windowSec - age)) };
  }

  async reset(key: string) {
    await this.prisma.rateLimit.deleteMany({ where: { key } });
  }
}
