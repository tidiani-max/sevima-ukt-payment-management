import { Inject, Injectable } from '@nestjs/common';
import { Prisma, ProcessingStatus } from '@prisma/client';
import { ENV, SECRET_BOX } from '../common/env.provider';
import type { Env } from '../config/env';
import { SecretBox } from '../common/secret-box';
import { PrismaService } from '../common/prisma.service';
import { PlatformAuditService } from '../audit/platform-audit.service';
import { uniqueViolation } from '../common/db-errors';
import { logger } from '../common/logger';
import { decide } from './decision';
import { auditFields, validatePayload, type PaymentEvent } from './payload';
import { verifySignature } from './signature';

/** Result of a webhook delivery: the HTTP status to answer with and the documented JSON body. */
export interface WebhookResult {
  httpStatus: number;
  body: { status: ProcessingStatus | 'UNKNOWN_INSTITUTION'; message: string; event_id?: string; invoice_number?: string; invoice_status?: string };
}

interface Ctx { requestId?: string; ip?: string }
type Tx = Prisma.TransactionClient;

const safeText = (b: Buffer) => b.toString('utf8').replace(/\u0000/g, '\uFFFD');

@Injectable()
export class WebhooksService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly platformAudit: PlatformAuditService,
    @Inject(SECRET_BOX) private readonly box: SecretBox,
    @Inject(ENV) private readonly env: Env,
  ) {}

  /**
   * Order of checks (each step is documented in README "Webhook decision order"):
   *  1 parse body -> 2 resolve institution -> 3 verify HMAC over the RAW bytes -> 4 validate payload
   *  -> 5 [one DB transaction] lock invoice, idempotency check, state machine, write audit + transaction.
   * Every delivery leaves an audit row: tenant-scoped when the institution is known, platform-level otherwise.
   */
  async handle(raw: Buffer, signatureHeader: string | undefined, ctx: Ctx): Promise<WebhookResult> {
    // 1. Parse (untrusted until the signature is verified; only used to find which institution's secret to use).
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw.toString('utf8'));
    } catch {
      return this.platformReject('MALFORMED_JSON', 400, null, raw, ctx, 'INVALID_PAYLOAD', 'The request body is not valid JSON.');
    }
    const claimed = (parsed as { institution_code?: unknown } | null)?.institution_code;
    if (typeof claimed !== 'string' || !/^[A-Za-z0-9_-]{1,32}$/.test(claimed)) {
      return this.platformReject('MISSING_INSTITUTION_CODE', 400, typeof claimed === 'string' ? claimed : null, raw, ctx, 'INVALID_PAYLOAD', 'institution_code is missing or invalid.');
    }

    // 2. Institution.
    const institution = await this.prisma.institution.findUnique({ where: { code: claimed }, select: { id: true, code: true, hmacSecretEnc: true } });
    if (!institution) {
      return this.platformReject('UNKNOWN_INSTITUTION', 404, claimed, raw, ctx, 'UNKNOWN_INSTITUTION', `Institution code ${claimed} is not registered.`);
    }

    const base = {
      institutionId: institution.id,
      institutionCode: institution.code,
      rawBody: safeText(raw),
      signature: signatureHeader?.slice(0, 200) ?? null,
      requestId: ctx.requestId ?? null,
      ...auditFields(parsed),
    };

    // 3. HMAC-SHA256 over the exact raw bytes, with this institution's own secret (constant-time compare).
    const secret = this.box.decrypt(institution.hmacSecretEnc, institution.id);
    if (!verifySignature(secret, raw, signatureHeader)) {
      return this.audited(this.prisma, base, false, 'INVALID_SIGNATURE', 401, 'The X-Signature header did not match the HMAC of the request body.', ctx);
    }

    // 4. Payload shape (now trustworthy as coming from the gateway, but still validated).
    const v = validatePayload(parsed);
    if (!v.ok) return this.audited(this.prisma, base, true, 'INVALID_PAYLOAD', 400, v.errors.join(' '), ctx);

    // 5. Atomic, idempotent processing. A concurrent duplicate that slips past the row lock hits the unique constraint
    //    (institutionId, eventId); we then re-run once and observe the committed winner.
    for (let attempt = 0; ; attempt++) {
      try {
        return await this.process(institution.id, { ...base, occurredAt: v.occurredAt }, v.value, v.occurredAt, ctx);
      } catch (e) {
        if (uniqueViolation(e) && attempt === 0) continue;
        logger.event('error', 'webhook_processing_failed', { requestId: ctx.requestId, eventId: v.value.event_id, institutionCode: institution.code, error: (e as Error).message });
        throw e;
      }
    }
  }

  private async process(
    institutionId: string,
    base: Omit<Prisma.WebhookEventUncheckedCreateInput, 'signatureValid' | 'processingStatus' | 'httpStatus' | 'errorMessage'>,
    evt: PaymentEvent,
    occurredAt: Date,
    ctx: Ctx,
  ): Promise<WebhookResult> {
    return this.prisma.$transaction(
      async (tx) => {
        // Row lock: serialises every delivery that targets the same invoice (duplicates AND competing events).
        const locked = await tx.$queryRaw<{ id: string }[]>(Prisma.sql`
          SELECT "id" FROM "Invoice" WHERE "institutionId" = ${institutionId}::uuid AND "invoiceNumber" = ${evt.invoice_number} FOR UPDATE`);
        const invoice = locked.length ? await tx.invoice.findUnique({ where: { id: locked[0].id } }) : null;

        // Idempotency: this event id was already turned into a transaction.
        const prior = await tx.transaction.findUnique({ where: { institutionId_eventId: { institutionId, eventId: evt.event_id } } });
        if (prior) {
          const same = invoice !== null && prior.invoiceId === invoice.id && prior.type === (evt.event_type === 'payment.success' ? 'PAYMENT_SUCCESS' : 'PAYMENT_EXPIRED') && prior.amount === BigInt(evt.amount);
          return same
            ? this.audited(tx, base, true, 'DUPLICATE', 200, `Event ${evt.event_id} was already processed; the repeat was ignored.`, ctx)
            : this.audited(tx, base, true, 'EVENT_CONFLICT', 409, `Event ${evt.event_id} was already processed with different content; the request was rejected.`, ctx);
        }
        if (!invoice) {
          return this.audited(tx, base, true, 'INVOICE_NOT_FOUND', 404, `No invoice ${evt.invoice_number} exists for institution ${base.institutionCode}.`, ctx);
        }

        const decision = decide({ status: invoice.status, amount: Number(invoice.amount), invoiceNumber: invoice.invoiceNumber }, { type: evt.event_type, amount: evt.amount });
        if (decision.kind === 'REJECT') {
          return this.audited(tx, base, true, decision.status, decision.httpStatus, decision.message, ctx, invoice.status);
        }

        // Apply: audit row + invoice status + transaction, committed atomically.
        const audit = await tx.webhookEvent.create({
          data: { ...base, signatureValid: true, processingStatus: 'PROCESSED', httpStatus: 200, occurredAt },
        });
        await tx.invoice.update({
          where: { id: invoice.id },
          data: { status: decision.to, paidAt: decision.to === 'PAID' ? occurredAt : null },
        });
        await tx.transaction.create({
          data: {
            institutionId,
            invoiceId: invoice.id,
            webhookEventId: audit.id,
            eventId: evt.event_id,
            type: evt.event_type === 'payment.success' ? 'PAYMENT_SUCCESS' : 'PAYMENT_EXPIRED',
            amount: BigInt(evt.amount),
            resultingStatus: decision.to,
            occurredAt,
          },
        });
        this.log('PROCESSED', 200, ctx, base);
        return {
          httpStatus: 200,
          body: { status: 'PROCESSED', message: 'The event was verified and applied.', event_id: evt.event_id, invoice_number: invoice.invoiceNumber, invoice_status: decision.to },
        };
      },
      { timeout: 15_000, maxWait: 10_000 },
    );
  }

  /** Writes the tenant-scoped audit row for a non-applied delivery and builds the response. */
  private async audited(
    db: Tx | PrismaService,
    base: Omit<Prisma.WebhookEventUncheckedCreateInput, 'signatureValid' | 'processingStatus' | 'httpStatus' | 'errorMessage'>,
    signatureValid: boolean,
    status: ProcessingStatus,
    httpStatus: number,
    message: string,
    ctx: Ctx,
    invoiceStatus?: string,
  ): Promise<WebhookResult> {
    const occurredAt = (() => {
      try { const d = new Date(JSON.parse(base.rawBody).occurred_at); return Number.isNaN(d.getTime()) ? null : d; } catch { return null; }
    })();
    await db.webhookEvent.create({ data: { ...base, occurredAt: base.occurredAt ?? occurredAt, signatureValid, processingStatus: status, httpStatus, errorMessage: message } });
    this.log(status, httpStatus, ctx, base);
    return {
      httpStatus,
      body: {
        status, message,
        ...(base.eventId ? { event_id: base.eventId } : {}),
        ...(base.invoiceNumber ? { invoice_number: base.invoiceNumber } : {}),
        ...(invoiceStatus ? { invoice_status: invoiceStatus } : {}),
      },
    };
  }

  private async platformReject(
    reason: string, httpStatus: number, claimed: string | null, raw: Buffer, ctx: Ctx,
    status: ProcessingStatus | 'UNKNOWN_INSTITUTION', message: string,
  ): Promise<WebhookResult> {
    await this.platformAudit.record({ reason, httpStatus, institutionCodeClaimed: claimed, rawBody: raw, ip: ctx.ip, requestId: ctx.requestId });
    logger.event('warn', 'webhook_rejected_untenanted', { requestId: ctx.requestId, reason, institutionCode: claimed });
    return { httpStatus, body: { status, message } };
  }

  private log(status: string, httpStatus: number, ctx: Ctx, base: { eventId?: string | null; institutionCode: string; invoiceNumber?: string | null }) {
    logger.event(status === 'PROCESSED' || status === 'DUPLICATE' ? 'info' : 'warn', 'webhook_delivery', {
      requestId: ctx.requestId, eventId: base.eventId, institutionCode: base.institutionCode, invoiceNumber: base.invoiceNumber, processingStatus: status, httpStatus,
    });
  }

  /** Tenant-scoped audit listing for the monitoring page. */
  async listEvents(institutionId: string, page: { limit: number; offset: number }, status?: string) {
    const where: Prisma.WebhookEventWhereInput = { institutionId, ...(status ? { processingStatus: status as ProcessingStatus } : {}) };
    const [rows, total] = await Promise.all([
      this.prisma.webhookEvent.findMany({ where, orderBy: [{ receivedAt: 'desc' }, { id: 'asc' }], take: page.limit, skip: page.offset }),
      this.prisma.webhookEvent.count({ where }),
    ]);
    return { rows, total };
  }

  /** Used by the mock gateway only. */
  async secretFor(code: string): Promise<{ id: string; secret: string } | null> {
    const inst = await this.prisma.institution.findUnique({ where: { code }, select: { id: true, hmacSecretEnc: true } });
    return inst ? { id: inst.id, secret: this.box.decrypt(inst.hmacSecretEnc, inst.id) } : null;
  }

  get targetUrl() { return this.env.webhookTargetUrl; }
}
