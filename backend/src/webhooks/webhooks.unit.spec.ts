import { decide } from './decision';
import { auditFields, validatePayload } from './payload';
import { sign, verifySignature } from './signature';

describe('signature', () => {
  const body = Buffer.from('{"a":1}');
  it('round-trips and is sensitive to every byte', () => {
    const sig = sign('s3cret', body);
    expect(sig).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(verifySignature('s3cret', body, sig)).toBe(true);
    expect(verifySignature('s3cret', Buffer.from('{"a":2}'), sig)).toBe(false);
    expect(verifySignature('other', body, sig)).toBe(false);
    expect(verifySignature('s3cret', Buffer.from('{"a":1} '), sig)).toBe(false);
  });
  it('matches an independently computed HMAC-SHA256 test vector', () => {
    // RFC 4231 test case 2: key "Jefe", data "what do ya want for nothing?"
    expect(sign('Jefe', 'what do ya want for nothing?')).toBe('sha256=5bdcc146bf60754e6a042426089575c75a003f089d2739839dec58b964ec3843');
  });
  it.each([undefined, '', 'sha256=', 'sha1=' + 'a'.repeat(40), 'sha256=' + 'g'.repeat(64), ' '])('rejects malformed header %p', (h) => {
    expect(verifySignature('s', body, h as string | undefined)).toBe(false);
  });
});

describe('payload validation', () => {
  const ok = { event_id: 'evt_1', event_type: 'payment.success', institution_code: 'UM001', invoice_number: 'UKT-2026-0001', amount: 6500000, occurred_at: '2026-11-08T10:30:00+07:00' };
  it('accepts the documented example and normalises the timestamp', () => {
    const v = validatePayload(ok);
    expect(v.ok && v.occurredAt.toISOString()).toBe('2026-11-08T03:30:00.000Z');
  });
  it('accepts Z and fractional seconds', () => expect(validatePayload({ ...ok, occurred_at: '2026-11-08T03:30:00.123Z' }).ok).toBe(true));
  it.each([
    [{ amount: 0 }], [{ amount: -1 }], [{ amount: 1.5 }], [{ amount: '5' }], [{ amount: 1e13 }], [{ amount: NaN }],
    [{ event_type: 'payment.refunded' }], [{ event_type: undefined }], [{ event_id: 'bad id!' }], [{ invoice_number: '../etc' }],
    [{ occurred_at: '2026-11-08' }], [{ occurred_at: '2026-13-45T10:30:00Z' }], [{ institution_code: 'a b' }],
  ])('rejects %j', (patch) => expect(validatePayload({ ...ok, ...patch }).ok).toBe(false));
  it('rejects non-objects', () => { for (const x of [null, [], 'x', 5]) expect(validatePayload(x).ok).toBe(false); });
  it('auditFields bounds untrusted values', () => {
    const f = auditFields({ event_id: 'x'.repeat(500), amount: 10 ** 15, invoice_number: 5 });
    expect(f.eventId).toHaveLength(100); expect(f.amount).toBeNull(); expect(f.invoiceNumber).toBeNull();
  });
});

describe('payment state machine', () => {
  const inv = (status: 'UNPAID' | 'PAID' | 'EXPIRED') => ({ status, amount: 1000, invoiceNumber: 'N' });
  it('UNPAID + success(amount ok) -> PAID', () => expect(decide(inv('UNPAID'), { type: 'payment.success', amount: 1000 })).toEqual({ kind: 'APPLY', to: 'PAID' }));
  it('UNPAID + expired -> EXPIRED', () => expect(decide(inv('UNPAID'), { type: 'payment.expired', amount: 1000 })).toEqual({ kind: 'APPLY', to: 'EXPIRED' }));
  it('UNPAID + success(wrong amount) -> AMOUNT_MISMATCH 422', () => expect(decide(inv('UNPAID'), { type: 'payment.success', amount: 999 })).toMatchObject({ kind: 'REJECT', status: 'AMOUNT_MISMATCH', httpStatus: 422 }));
  it('EXPIRED + success -> REQUIRES_REVIEW (never auto-paid)', () => expect(decide(inv('EXPIRED'), { type: 'payment.success', amount: 1000 })).toMatchObject({ kind: 'REJECT', status: 'REQUIRES_REVIEW' }));
  it('PAID + expired -> INVALID_STATE (never overwritten)', () => expect(decide(inv('PAID'), { type: 'payment.expired', amount: 1000 })).toMatchObject({ kind: 'REJECT', status: 'INVALID_STATE' }));
  it('PAID + success / EXPIRED + expired -> INVALID_STATE', () => {
    expect(decide(inv('PAID'), { type: 'payment.success', amount: 1000 })).toMatchObject({ status: 'INVALID_STATE' });
    expect(decide(inv('EXPIRED'), { type: 'payment.expired', amount: 1000 })).toMatchObject({ status: 'INVALID_STATE' });
  });
  it('exhaustively: only UNPAID can ever be applied', () => {
    for (const s of ['PAID', 'EXPIRED'] as const) for (const t of ['payment.success', 'payment.expired'] as const) expect(decide(inv(s), { type: t, amount: 1000 }).kind).toBe('REJECT');
  });
});
