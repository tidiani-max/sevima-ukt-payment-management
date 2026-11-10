import { ACCOUNTS, boot, deliver, evtPayload, Harness, login } from './helpers';

/** The complete scenario from the assessment brief, executed through the real HTTP API and PostgreSQL. */
describe('End-to-end: invoice -> gateway -> PAID -> student sees it', () => {
  let h: Harness;
  beforeAll(async () => { h = await boot(); });
  afterAll(async () => { await h.close(); });

  it('runs the whole payment lifecycle', async () => {
    // 1. Finance administrator logs in
    const admin = await login(h, ACCOUNTS.umAdmin);
    // 2. creates an invoice for Nadia
    const students = (await admin.get('/students')).body as { id: string; nim: string }[];
    const nadiaRow = students.find((s) => s.nim === '2310111208')!;
    const created = await admin.post('/invoices', {
      studentId: nadiaRow.id, invoiceNumber: 'UKT-2026-E2E', semester: 'Genap 2026/2027', amount: 6_500_000, issuedAt: '2026-11-09', expiresAt: '2027-02-28',
    });
    expect(created.status).toBe(201);
    // 3. persisted in PostgreSQL
    const db = await h.prisma.invoice.findUniqueOrThrow({ where: { id: created.body.id } });
    expect(db.status).toBe('UNPAID');

    // 4-6. mock gateway sends payment.success; backend verifies HMAC and processes exactly once
    const payload = evtPayload({ code: 'UM001', invoice: 'UKT-2026-E2E', amount: 6_500_000, id: 'evt_e2e_1' });
    const sim = await admin.post('/dev/webhooks/simulate', { payload, tamperSignature: false });
    expect(sim.body).toMatchObject({ sent: true, httpStatus: 200, processingStatus: 'PROCESSED' });
    const replay = await admin.post('/dev/webhooks/simulate', { payload, tamperSignature: false });
    expect(replay.body.processingStatus).toBe('DUPLICATE');

    // 7-9. invoice PAID, transaction recorded, audit saved
    expect((await h.prisma.invoice.findUniqueOrThrow({ where: { id: created.body.id } })).status).toBe('PAID');
    expect(await h.prisma.transaction.count({ where: { invoiceId: created.body.id } })).toBe(1);
    const events = (await admin.get('/webhooks/events?limit=500')).body as { eventId: string; processingStatus: string }[];
    expect(events.filter((e) => e.eventId === 'evt_e2e_1').map((e) => e.processingStatus).sort()).toEqual(['DUPLICATE', 'PROCESSED']);

    // 10-12. Student logs in, sees the PAID invoice and its transaction history
    const nadia = await login(h, ACCOUNTS.nadia);
    const mine = (await nadia.get('/me/invoices')).body as { invoiceNumber: string; status: string }[];
    expect(mine.find((i) => i.invoiceNumber === 'UKT-2026-E2E')?.status).toBe('PAID');
    const txs = (await nadia.get('/me/transactions')).body as { invoiceNumber: string; eventId: string; type: string; resultingStatus: string }[];
    expect(txs.find((t) => t.invoiceNumber === 'UKT-2026-E2E')).toMatchObject({ eventId: 'evt_e2e_1', type: 'payment.success', resultingStatus: 'PAID' });
    // and administrators see it too
    expect(((await admin.get('/transactions')).body as { invoiceNumber: string }[]).some((t) => t.invoiceNumber === 'UKT-2026-E2E')).toBe(true);
  });

  it('failure path: tampered signature leaves the invoice UNPAID and the student sees UNPAID with no transaction', async () => {
    const admin = await login(h, ACCOUNTS.umAdmin);
    const students = (await admin.get('/students')).body as { id: string; nim: string }[];
    const farhan = students.find((s) => s.nim === '2210501042')!;
    const created = await admin.post('/invoices', { studentId: farhan.id, invoiceNumber: 'UKT-2026-E2E-F', semester: 'Genap 2026/2027', amount: 7_000_000, issuedAt: '2026-11-09', expiresAt: '2027-02-28' });
    expect(created.status).toBe(201);
    const res = await deliver(h, evtPayload({ code: 'UM001', invoice: 'UKT-2026-E2E-F', amount: 7_000_000 }), { signature: 'sha256=' + 'a'.repeat(64) });
    expect(res.status).toBe(401);
    const student = await login(h, ACCOUNTS.farhan);
    const inv = ((await student.get('/me/invoices')).body as { invoiceNumber: string; status: string }[]).find((i) => i.invoiceNumber === 'UKT-2026-E2E-F');
    expect(inv?.status).toBe('UNPAID');
    expect(((await student.get('/me/transactions')).body as { invoiceNumber: string }[]).some((t) => t.invoiceNumber === 'UKT-2026-E2E-F')).toBe(false);
  });

  it('health and readiness endpoints respond; readiness checks the database', async () => {
    const { anon } = await import('./helpers');
    expect((await anon(h).get('/api/health')).body).toEqual({ status: 'ok' });
    expect((await anon(h).get('/api/ready')).body).toEqual({ status: 'ready' });
    expect((await anon(h).get('/api/health')).headers['x-request-id']).toBeTruthy();
  });
});
