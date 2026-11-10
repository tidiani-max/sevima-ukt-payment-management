import { Injectable } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import { logger } from '../common/logger';

/**
 * Restricted platform-level audit trail for notifications that belong to NO tenant (unknown institution code,
 * unparseable body). Nothing in the tenant-facing API reads this table.
 */
@Injectable()
export class PlatformAuditService {
  constructor(private readonly prisma: PrismaService) {}

  async record(e: { reason: string; httpStatus: number; institutionCodeClaimed?: string | null; rawBody: Buffer; ip?: string; requestId?: string }) {
    try {
      await this.prisma.platformSecurityEvent.create({
        data: {
          reason: e.reason,
          httpStatus: e.httpStatus,
          institutionCodeClaimed: e.institutionCodeClaimed?.slice(0, 64) ?? null,
          bodySnippet: e.rawBody.subarray(0, 2000).toString('utf8').replace(/\u0000/g, '\uFFFD'),
          sourceIp: e.ip?.slice(0, 64) ?? null,
          requestId: e.requestId ?? null,
        },
      });
    } catch (err) {
      logger.event('error', 'platform_audit_failed', { requestId: e.requestId, error: (err as Error).message });
    }
  }
}
