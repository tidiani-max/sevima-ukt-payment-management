export type EventType = 'payment.success' | 'payment.expired';
export const EVENT_TYPES: readonly EventType[] = ['payment.success', 'payment.expired'];
export const MAX_AMOUNT = 1_000_000_000_000;

export interface PaymentEvent {
  event_id: string;
  event_type: EventType;
  institution_code: string;
  invoice_number: string;
  amount: number;
  occurred_at: string;
}

const ISO = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/;

export type Validation = { ok: true; value: PaymentEvent; occurredAt: Date } | { ok: false; errors: string[] };

/** Strict structural validation of a (signature-verified) webhook payload. Unknown extra fields are tolerated. */
export function validatePayload(raw: unknown): Validation {
  const errors: string[] = [];
  if (typeof raw !== 'object' || raw === null || Array.isArray(raw)) return { ok: false, errors: ['Body must be a JSON object.'] };
  const p = raw as Record<string, unknown>;

  if (typeof p.event_id !== 'string' || !/^[A-Za-z0-9_.:-]{1,100}$/.test(p.event_id)) errors.push('event_id must be 1-100 characters of letters, digits, "_", ".", ":" or "-".');
  if (typeof p.event_type !== 'string' || !EVENT_TYPES.includes(p.event_type as EventType)) errors.push(`event_type must be one of: ${EVENT_TYPES.join(', ')}.`);
  if (typeof p.institution_code !== 'string' || !/^[A-Za-z0-9_-]{1,32}$/.test(p.institution_code)) errors.push('institution_code is invalid.');
  if (typeof p.invoice_number !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._\/-]{0,63}$/.test(p.invoice_number)) errors.push('invoice_number is invalid.');
  if (typeof p.amount !== 'number' || !Number.isSafeInteger(p.amount) || p.amount <= 0 || p.amount > MAX_AMOUNT) errors.push('amount must be a positive whole number of rupiah.');

  let occurredAt = new Date(NaN);
  if (typeof p.occurred_at !== 'string' || !ISO.test(p.occurred_at) || Number.isNaN((occurredAt = new Date(p.occurred_at)).getTime())) {
    errors.push('occurred_at must be an ISO-8601 timestamp with a UTC offset, e.g. 2026-11-08T10:30:00+07:00.');
  }
  if (errors.length) return { ok: false, errors };
  return { ok: true, value: p as unknown as PaymentEvent, occurredAt };
}

/** Best-effort, length-bounded copies of payload fields for the audit row of a rejected delivery. */
export function auditFields(raw: unknown) {
  const o = (typeof raw === 'object' && raw !== null ? raw : {}) as Record<string, unknown>;
  const s = (v: unknown, n: number) => (typeof v === 'string' ? v.slice(0, n) : null);
  return {
    eventId: s(o.event_id, 100),
    eventType: s(o.event_type, 64),
    invoiceNumber: s(o.invoice_number, 64),
    amount: typeof o.amount === 'number' && Number.isSafeInteger(o.amount) && o.amount > 0 && o.amount <= 1e12 ? BigInt(o.amount) : null,
  };
}
