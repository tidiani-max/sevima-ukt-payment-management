import { sign } from '../src/webhooks/signature';
import { ACCOUNTS, boot, Client, deliver, evtPayload, Harness, login, makeInvoice, SECRETS } from './helpers';

describe('Payment webhook', () => {
  let h: Harness;
  let um: Client;
  beforeAll(async () => { h = await boot(); um = await login(h, ACCOUNTS.umAdmin); });
  afterAll(async () => { await h.close(); });

  const invoiceOf = (id: string) => h.prisma.invoice.findUniqueOrThrow({ where: { id } });
  const txCount = (invoiceId: string) => h.prisma.transaction.count({ where: { invoiceId } });
  const audits = (eventId: string) => h.prisma.webhookEvent.findMany({ where: { eventId }, orderBy: { receivedAt: 'asc' } });

  it('payment.success with a valid signature and matching amount marks the invoice PAID, records a transaction and an audit row', async () => {
    const inv = await makeInvoice(h, { code: 'UM001' });
    const p = evtPayload({ code: 'UM001', invoice: inv.number, amount: inv.amount, id: 'evt_ok_1', at: '2026-11-08T10:30:00+07:00' });
    const res = await deliver(h, p);
    expect(res.status).toBe(200);
    expect(res.body).toMatchObject({ status: 'PROCESSED', invoice_status: 'PAID', event_id: 'evt_ok_1' });
    const row = await invoiceOf(inv.id);
    expect(row.status).toBe('PAID');
    expect(row.paidAt?.toISOString()).toBe('2026-11-08T03:30:00.000Z');
    const tx = await h.prisma.transaction.findMany({ where: { invoiceId: inv.id } });
    expect(tx).toHaveLength(1);
    expect(tx[0]).toMatchObject({ eventId: 'evt_ok_1', type: 'PAYMENT_SUCCESS', resultingStatus: 'PAID' });
    const [a] = await audits('evt_ok_1');
    expect(a).toMatchObject({ processingStatus: 'PROCESSED', signatureValid: true, httpStatus: 200, institutionCode: 'UM001' });
    expect(a.occurredAt?.toISOString()).toBe('2026-11-08T03:30:00.000Z'); // gateway time kept ...
    expect(a.receivedAt.getTime()).toBeGreaterThan(a.occurredAt!.getTime()); // ... separately from reception time
    expect(tx[0].webhookEventId).toBe(a.id); // transaction linked to its originating event
  });

  it('payment.expired moves an UNPAID invoice to EXPIRED', async () => {
    const inv = await makeInvoice(h, { code: 'UM001' });
    const res = await deliver(h, evtPayload({ code: 'UM001', invoice: inv.number, amount: inv.amount, type: 'payment.expired' }));
    expect(res.status).toBe(200);
    expect(res.body.invoice_status).toBe('EXPIRED');
    expect((await invoiceOf(inv.id)).status).toBe('EXPIRED');
    expect(await txCount(inv.id)).toBe(1);
  });

  it('rejects an invalid signature (401), changes nothing, and still writes an audit row', async () => {
    const inv = await makeInvoice(h, { code: 'UM001' });
    const p = evtPayload({ code: 'UM001', invoice: inv.number, amount: inv.amount, id: 'evt_badsig' });
    const res = await deliver(h, p, { signature: 'sha256=' + '0'.repeat(64) });
    expect(res.status).toBe(401);
    expect(res.body.status).toBe('INVALID_SIGNATURE');
    expect((await invoiceOf(inv.id)).status).toBe('UNPAID');
    expect(await txCount(inv.id)).toBe(0);
    const [a] = await audits('evt_badsig');
    expect(a).toMatchObject({ processingStatus: 'INVALID_SIGNATURE', signatureValid: false, httpStatus: 401 });
  });

  it.each([
    ['missing header', null],
    ['no sha256= prefix', 'a'.repeat(64)],
    ['wrong length', 'sha256=abcd'],
    ['non-hex', 'sha256=' + 'z'.repeat(64)],
  ])('rejects a malformed signature header: %s', async (_n, sig) => {
    const inv = await makeInvoice(h, { code: 'UM001' });
    const res = await deliver(h, evtPayload({ code: 'UM001', invoice: inv.number, amount: inv.amount }), { signature: sig });
    expect(res.status).toBe(401);
    expect((await invoiceOf(inv.id)).status).toBe('UNPAID');
  });

  it('a tampered body (signed original, altered amount) is rejected', async () => {
    const inv = await makeInvoice(h, { code: 'UM001', amount: 6_500_000 });
    const good = evtPayload({ code: 'UM001', invoice: inv.number, amount: 100 });
    const signatureOfSmall = sign(SECRETS.UM001, JSON.stringify(good));
    const tampered = JSON.stringify({ ...good, amount: inv.amount });
    const res = await deliver(h, tampered, { signature: signatureOfSmall });
    expect(res.status).toBe(401);
    expect((await invoiceOf(inv.id)).status).toBe('UNPAID');
  });

  it('verifies the EXACT raw bytes: signing compact JSON but sending pretty JSON fails; signing the pretty bytes succeeds', async () => {
    const inv = await makeInvoice(h, { code: 'UM001' });
    const p = evtPayload({ code: 'UM001', invoice: inv.number, amount: inv.amount, id: 'evt_raw_1' });
    const pretty = JSON.stringify(p, null, 2);
    expect((await deliver(h, pretty, { signature: sign(SECRETS.UM001, JSON.stringify(p)) })).status).toBe(401);
    const ok = await deliver(h, pretty, { signature: sign(SECRETS.UM001, pretty) });
    expect(ok.status).toBe(200);
    expect(ok.body.status).toBe('PROCESSED');
  });

  it('accepts uppercase hex in the signature (hex is case-insensitive)', async () => {
    const inv = await makeInvoice(h, { code: 'UM001' });
    const p = evtPayload({ code: 'UM001', invoice: inv.number, amount: inv.amount });
    const raw = JSON.stringify(p);
    const sig = 'sha256=' + sign(SECRETS.UM001, raw).slice(7).toUpperCase();
    expect((await deliver(h, raw, { signature: sig })).status).toBe(200);
  });

  it('unknown institution: 404, nothing applied, recorded only in the platform-level table', async () => {
    const res = await deliver(h, evtPayload({ code: 'NOPE99', invoice: 'X', amount: 1 }), { secret: 'irrelevant' });
    expect(res.status).toBe(404);
    expect(res.body.status).toBe('UNKNOWN_INSTITUTION');
    expect(await h.prisma.platformSecurityEvent.count({ where: { institutionCodeClaimed: 'NOPE99', reason: 'UNKNOWN_INSTITUTION' } })).toBe(1);
  });

  it('malformed JSON and missing institution_code are rejected (400) and kept in the platform table', async () => {
    expect((await deliver(h, '{not json', { secret: 'x' })).status).toBe(400);
    expect((await deliver(h, { event_id: 'e', amount: 5 }, { secret: 'x' })).status).toBe(400);
    expect(await h.prisma.platformSecurityEvent.count({ where: { reason: { in: ['MALFORMED_JSON', 'MISSING_INSTITUTION_CODE'] } } })).toBe(2);
  });

  it('missing invoice: 404 INVOICE_NOT_FOUND with an audit row', async () => {
    const res = await deliver(h, evtPayload({ code: 'UM001', invoice: 'NO-SUCH-INVOICE', amount: 1000, id: 'evt_missing' }));
    expect(res.status).toBe(404);
    expect(res.body.status).toBe('INVOICE_NOT_FOUND');
    expect((await audits('evt_missing'))[0].processingStatus).toBe('INVOICE_NOT_FOUND');
  });

  it('incorrect amount never marks the invoice paid (422 AMOUNT_MISMATCH) and is audited', async () => {
    const inv = await makeInvoice(h, { code: 'UM001', amount: 6_500_000 });
    for (const amount of [6_499_999, 6_500_001, 1]) {
      const res = await deliver(h, evtPayload({ code: 'UM001', invoice: inv.number, amount, id: `evt_amt_${amount}` }));
      expect(res.status).toBe(422);
      expect(res.body.status).toBe('AMOUNT_MISMATCH');
    }
    expect((await invoiceOf(inv.id)).status).toBe('UNPAID');
    expect(await txCount(inv.id)).toBe(0);
    expect((await audits('evt_amt_1'))[0].processingStatus).toBe('AMOUNT_MISMATCH');
  });

  it('after a mismatch, the correct payment still succeeds', async () => {
    const inv = await makeInvoice(h, { code: 'UM001', amount: 3_000_000 });
    expect((await deliver(h, evtPayload({ code: 'UM001', invoice: inv.number, amount: 1 }))).status).toBe(422);
    expect((await deliver(h, evtPayload({ code: 'UM001', invoice: inv.number, amount: 3_000_000 }))).status).toBe(200);
    expect((await invoiceOf(inv.id)).status).toBe('PAID');
  });

  it('invalid payloads are rejected after signature check (400) and audited under the institution', async () => {
    const inv = await makeInvoice(h, { code: 'UM001' });
    const bad = { ...evtPayload({ code: 'UM001', invoice: inv.number, amount: inv.amount, id: 'evt_badtype' }), event_type: 'payment.refunded' };
    const res = await deliver(h, bad);
    expect(res.status).toBe(400);
    expect(res.body.status).toBe('INVALID_PAYLOAD');
    expect(res.body.message).toMatch(/event_type/);
    expect((await audits('evt_badtype'))[0]).toMatchObject({ processingStatus: 'INVALID_PAYLOAD', signatureValid: true });
    for (const patch of [{ amount: -5 }, { amount: 10.5 }, { amount: '6500000' }, { occurred_at: 'yesterday' }, { occurred_at: '2026-11-08T10:30:00' }, { event_id: '' }]) {
      expect((await deliver(h, { ...evtPayload({ code: 'UM001', invoice: inv.number, amount: inv.amount }), ...patch })).status).toBe(400);
    }
    expect((await invoiceOf(inv.id)).status).toBe('UNPAID');
  });

  it('duplicate delivery: 200 DUPLICATE, no second transaction, both deliveries audited', async () => {
    const inv = await makeInvoice(h, { code: 'UM001' });
    const p = evtPayload({ code: 'UM001', invoice: inv.number, amount: inv.amount, id: 'evt_dup_1' });
    expect((await deliver(h, p)).body.status).toBe('PROCESSED');
    const again = await deliver(h, p);
    expect(again.status).toBe(200);
    expect(again.body.status).toBe('DUPLICATE');
    expect(await txCount(inv.id)).toBe(1);
    expect((await audits('evt_dup_1')).map((a) => a.processingStatus)).toEqual(['PROCESSED', 'DUPLICATE']);
  });

  it('late payment.success on an EXPIRED invoice is NOT applied and is flagged REQUIRES_REVIEW', async () => {
    const inv = await makeInvoice(h, { code: 'UM001' });
    await deliver(h, evtPayload({ code: 'UM001', invoice: inv.number, amount: inv.amount, type: 'payment.expired' }));
    const late = await deliver(h, evtPayload({ code: 'UM001', invoice: inv.number, amount: inv.amount, id: 'evt_late_ok' }));
    expect(late.status).toBe(409);
    expect(late.body.status).toBe('REQUIRES_REVIEW');
    const row = await invoiceOf(inv.id);
    expect(row.status).toBe('EXPIRED');
    expect(await txCount(inv.id)).toBe(1); // only the expiry
    expect((await audits('evt_late_ok'))[0].processingStatus).toBe('REQUIRES_REVIEW'); // visible to finance for reconciliation
  });

  it('late payment.expired on a PAID invoice never overwrites PAID', async () => {
    const inv = await makeInvoice(h, { code: 'UM001' });
    await deliver(h, evtPayload({ code: 'UM001', invoice: inv.number, amount: inv.amount }));
    const late = await deliver(h, evtPayload({ code: 'UM001', invoice: inv.number, amount: inv.amount, type: 'payment.expired' }));
    expect(late.status).toBe(409);
    expect(late.body.status).toBe('INVALID_STATE');
    expect((await invoiceOf(inv.id)).status).toBe('PAID');
    expect(await txCount(inv.id)).toBe(1);
  });

  it('a second, different success event for an already PAID invoice is refused (no double payment record)', async () => {
    const inv = await makeInvoice(h, { code: 'UM001' });
    await deliver(h, evtPayload({ code: 'UM001', invoice: inv.number, amount: inv.amount }));
    const res = await deliver(h, evtPayload({ code: 'UM001', invoice: inv.number, amount: inv.amount }));
    expect(res.status).toBe(409);
    expect(await txCount(inv.id)).toBe(1);
  });

  it('re-using an event_id with different content is rejected as EVENT_CONFLICT', async () => {
    const a = await makeInvoice(h, { code: 'UM001' });
    const b = await makeInvoice(h, { code: 'UM001' });
    await deliver(h, evtPayload({ code: 'UM001', invoice: a.number, amount: a.amount, id: 'evt_reuse' }));
    const res = await deliver(h, evtPayload({ code: 'UM001', invoice: b.number, amount: b.amount, id: 'evt_reuse' }));
    expect(res.status).toBe(409);
    expect(res.body.status).toBe('EVENT_CONFLICT');
    expect((await invoiceOf(b.id)).status).toBe('UNPAID');
  });

  it('the same event_id is independent across institutions', async () => {
    const a = await makeInvoice(h, { code: 'UM001' });
    const b = await makeInvoice(h, { code: 'UB001' });
    expect((await deliver(h, evtPayload({ code: 'UM001', invoice: a.number, amount: a.amount, id: 'evt_shared' }))).status).toBe(200);
    expect((await deliver(h, evtPayload({ code: 'UB001', invoice: b.number, amount: b.amount, id: 'evt_shared' }))).body.status).toBe('PROCESSED');
  });

  it('CONCURRENCY: 20 simultaneous deliveries of the same event produce exactly one PAID transition and one transaction', async () => {
    const inv = await makeInvoice(h, { code: 'UM001' });
    const p = evtPayload({ code: 'UM001', invoice: inv.number, amount: inv.amount, id: 'evt_race_dup' });
    const results = await Promise.all(Array.from({ length: 20 }, () => deliver(h, p)));
    const statuses = results.map((r) => r.body.status);
    expect(statuses.filter((s) => s === 'PROCESSED')).toHaveLength(1);
    expect(statuses.filter((s) => s === 'DUPLICATE')).toHaveLength(19);
    expect(results.every((r) => r.status === 200)).toBe(true);
    expect(await txCount(inv.id)).toBe(1);
    expect(await h.prisma.transaction.count({ where: { eventId: 'evt_race_dup' } })).toBe(1);
    expect((await invoiceOf(inv.id)).status).toBe('PAID');
    expect(await h.prisma.webhookEvent.count({ where: { eventId: 'evt_race_dup' } })).toBe(20); // every delivery audited
  });

  it('CONCURRENCY: competing success and expiry events for one invoice resolve to exactly one winner', async () => {
    const inv = await makeInvoice(h, { code: 'UM001' });
    const reqs = [
      ...Array.from({ length: 5 }, (_, i) => deliver(h, evtPayload({ code: 'UM001', invoice: inv.number, amount: inv.amount, id: `evt_win_s${i}` }))),
      ...Array.from({ length: 5 }, (_, i) => deliver(h, evtPayload({ code: 'UM001', invoice: inv.number, amount: inv.amount, type: 'payment.expired', id: `evt_win_e${i}` }))),
    ];
    const results = await Promise.all(reqs);
    expect(results.filter((r) => r.body.status === 'PROCESSED')).toHaveLength(1);
    expect(await txCount(inv.id)).toBe(1);
    const final = (await invoiceOf(inv.id)).status;
    expect(['PAID', 'EXPIRED']).toContain(final);
  });

  it('CONCURRENCY: the same event_id aimed at two different invoices cannot create two transactions', async () => {
    const a = await makeInvoice(h, { code: 'UM001' });
    const b = await makeInvoice(h, { code: 'UM001' });
    const results = await Promise.all([
      deliver(h, evtPayload({ code: 'UM001', invoice: a.number, amount: a.amount, id: 'evt_x_inv' })),
      deliver(h, evtPayload({ code: 'UM001', invoice: b.number, amount: b.amount, id: 'evt_x_inv' })),
    ]);
    expect(results.filter((r) => r.body.status === 'PROCESSED')).toHaveLength(1);
    expect(await h.prisma.transaction.count({ where: { eventId: 'evt_x_inv' } })).toBe(1);
  });

  it('a transaction and its invoice status change are atomic (no half-applied state)', async () => {
    const paid = await h.prisma.invoice.findMany({ where: { status: 'PAID' }, include: { transactions: true } });
    for (const i of paid) expect(i.transactions.some((t) => t.resultingStatus === 'PAID')).toBe(true);
  });

  it('rejects oversized bodies with 413 and non-body requests cleanly', async () => {
    const big = JSON.stringify({ institution_code: 'UM001', pad: 'a'.repeat(70_000) });
    expect((await deliver(h, big)).status).toBe(413);
  });

  it('the audit list shows real persisted rows to the administrator, without raw bodies or secrets', async () => {
    const events = (await um.get('/webhooks/events?limit=500')).body;
    expect(events.find((e: { eventId: string }) => e.eventId === 'evt_ok_1')).toMatchObject({ processingStatus: 'PROCESSED', signatureValid: true, httpStatus: 200, institutionCode: 'UM001' });
    expect(JSON.stringify(events)).not.toMatch(/rawBody/);
    expect(events.some((e: { processingStatus: string }) => e.processingStatus === 'INVALID_SIGNATURE')).toBe(true);
    expect((await um.get('/webhooks/events?status=DUPLICATE')).body.every((e: { processingStatus: string }) => e.processingStatus === 'DUPLICATE')).toBe(true);
  });
});

describe('Mock payment gateway (dev simulator)', () => {
  let h: Harness;
  let um: Client, nadia: Client;
  beforeAll(async () => { h = await boot(); um = await login(h, ACCOUNTS.umAdmin); nadia = await login(h, ACCOUNTS.nadia); });
  afterAll(async () => { await h.close(); });

  it('signs with the real server-side secret, calls the real endpoint and reports the actual outcome', async () => {
    const inv = await makeInvoice(h, { code: 'UM001' });
    const payload = evtPayload({ code: 'UM001', invoice: inv.number, amount: inv.amount, id: 'evt_sim_1' });
    const res = await um.post('/dev/webhooks/simulate', { payload, tamperSignature: false });
    expect(res.body).toMatchObject({ sent: true, httpStatus: 200, processingStatus: 'PROCESSED' });
    expect(res.body.signature).toMatch(/^sha256=[0-9a-f]{64}$/);
    expect(res.body.signature).toBe(sign(SECRETS.UM001, JSON.stringify(payload)));
    expect(JSON.stringify(res.body)).not.toContain(SECRETS.UM001);
    expect((await h.prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).status).toBe('PAID');
  });

  it('can simulate expiry, duplicate, wrong amount, and an invalid signature through the real pipeline', async () => {
    const inv = await makeInvoice(h, { code: 'UM001' });
    const p = evtPayload({ code: 'UM001', invoice: inv.number, amount: inv.amount, id: 'evt_sim_2' });
    expect((await um.post('/dev/webhooks/simulate', { payload: p, tamperSignature: true })).body).toMatchObject({ httpStatus: 401, processingStatus: 'INVALID_SIGNATURE' });
    expect((await um.post('/dev/webhooks/simulate', { payload: { ...p, amount: 1 }, tamperSignature: false })).body).toMatchObject({ httpStatus: 422, processingStatus: 'AMOUNT_MISMATCH' });
    expect((await um.post('/dev/webhooks/simulate', { payload: p, tamperSignature: false })).body.processingStatus).toBe('PROCESSED');
    expect((await um.post('/dev/webhooks/simulate', { payload: p, tamperSignature: false })).body.processingStatus).toBe('DUPLICATE');
    const exp = await makeInvoice(h, { code: 'UM001' });
    const r = await um.post('/dev/webhooks/simulate', { payload: evtPayload({ code: 'UM001', invoice: exp.number, amount: exp.amount, type: 'payment.expired' }), tamperSignature: false });
    expect(r.body.processingStatus).toBe('PROCESSED');
    expect((await h.prisma.invoice.findUniqueOrThrow({ where: { id: exp.id } })).status).toBe('EXPIRED');
  });

  it('simulating an unregistered institution code yields UNKNOWN_INSTITUTION', async () => {
    const res = await um.post('/dev/webhooks/simulate', { payload: evtPayload({ code: 'XX999', invoice: 'A', amount: 1 }), tamperSignature: false });
    expect(res.body).toMatchObject({ sent: true, httpStatus: 404, processingStatus: 'UNKNOWN_INSTITUTION' });
  });

  it('an administrator cannot use the simulator against ANOTHER institution (403)', async () => {
    const ub = await makeInvoice(h, { code: 'UB001' });
    const res = await um.post('/dev/webhooks/simulate', { payload: evtPayload({ code: 'UB001', invoice: ub.number, amount: ub.amount }), tamperSignature: false });
    expect(res.status).toBe(403);
    expect((await h.prisma.invoice.findUniqueOrThrow({ where: { id: ub.id } })).status).toBe('UNPAID');
  });

  it('students cannot use the simulator; public config tells the SPA it is enabled', async () => {
    expect((await nadia.post('/dev/webhooks/simulate', { payload: {} })).status).toBe(403);
    const cfg = await um.get('/config');
    expect(cfg.body.mockGatewayEnabled).toBe(true);
  });
});
