import { ACCOUNTS, boot, Client, deliver, evtPayload, Harness, login, makeInvoice, SECRETS } from './helpers';

describe('Multi-institution data isolation', () => {
  let h: Harness;
  let um: Client, ub: Client, nadia: Client, farhan: Client, rizky: Client;
  const ids = (rows: { id: string }[]) => rows.map((r) => r.id);

  beforeAll(async () => {
    h = await boot();
    [um, ub, nadia, farhan, rizky] = await Promise.all([ACCOUNTS.umAdmin, ACCOUNTS.ubAdmin, ACCOUNTS.nadia, ACCOUNTS.farhan, ACCOUNTS.rizky].map((e) => login(h, e)));
  });
  afterAll(async () => { await h.close(); });

  it('Institution A admin never sees Institution B invoices (list and by id)', async () => {
    const umList = (await um.get('/invoices')).body, ubList = (await ub.get('/invoices')).body;
    expect(umList.length).toBeGreaterThan(0);
    expect(umList.every((i: { institutionId: string }) => i.institutionId === um.session.institution.id)).toBe(true);
    expect(ids(umList).filter((i) => ids(ubList).includes(i))).toEqual([]);
    for (const inv of ubList) expect((await um.get(`/invoices/${inv.id}`)).status).toBe(404);
  });

  it('same invoice number exists in both institutions but each admin sees only their own row', async () => {
    const a = (await um.get('/invoices?q=UKT-2026-0001')).body, b = (await ub.get('/invoices?q=UKT-2026-0001')).body;
    expect(a).toHaveLength(1); expect(b).toHaveLength(1);
    expect(a[0].id).not.toBe(b[0].id);
  });

  it('students list is institution-scoped', async () => {
    const umS = (await um.get('/students')).body, ubS = (await ub.get('/students')).body;
    expect(umS).toHaveLength(3); expect(ubS).toHaveLength(2);
    expect(ids(umS).some((i) => ids(ubS).includes(i))).toBe(false);
  });

  it('transactions are institution-scoped', async () => {
    const t = (await um.get('/transactions')).body;
    expect(t.length).toBeGreaterThan(0);
    expect(t.every((x: { institutionId: string }) => x.institutionId === um.session.institution.id)).toBe(true);
    const other = (await ub.get('/transactions')).body;
    expect(ids(t).some((i) => ids(other).includes(i))).toBe(false);
  });

  it('webhook audit records are institution-scoped', async () => {
    const e = (await um.get('/webhooks/events')).body;
    expect(e.length).toBeGreaterThan(0);
    expect(e.every((x: { institutionCode: string }) => x.institutionCode === 'UM001')).toBe(true);
    expect((await ub.get('/webhooks/events')).body.every((x: { institutionCode: string }) => x.institutionCode === 'UB001')).toBe(true);
  });

  it('semesters and institutions endpoints expose only the caller\'s tenant', async () => {
    const inst = await um.get('/institutions');
    expect(inst.body).toEqual([{ id: um.session.institution.id, code: 'UM001', name: 'Universitas Negeri Malang' }]);
    expect(JSON.stringify(inst.body)).not.toMatch(/secret|hmac/i);
  });

  it('a student sees only their own invoices and transactions, not another student\'s in the same institution', async () => {
    const n = (await nadia.get('/me/invoices')).body, f = (await farhan.get('/me/invoices')).body;
    expect(n.every((i: { studentId: string }) => i.studentId === nadia.session.user.studentId)).toBe(true);
    expect(f.every((i: { studentId: string }) => i.studentId === farhan.session.user.studentId)).toBe(true);
    for (const inv of f) expect((await nadia.get(`/invoices/${inv.id}`)).status).toBe(404);
    const nt = (await nadia.get('/me/transactions')).body, ft = (await farhan.get('/me/transactions')).body;
    expect(ids(nt).some((i) => ids(ft).includes(i))).toBe(false);
    expect(nt.length).toBeGreaterThan(0);
    expect(ft.length).toBeGreaterThan(0);
  });

  it('a student from another institution cannot read a UM invoice', async () => {
    const some = (await nadia.get('/me/invoices')).body[0];
    expect((await rizky.get(`/invoices/${some.id}`)).status).toBe(404);
  });

  it('an event signed with ANOTHER institution\'s secret is rejected (per-institution secrets)', async () => {
    const inv = await makeInvoice(h, { code: 'UM001' });
    const res = await deliver(h, evtPayload({ code: 'UM001', invoice: inv.number, amount: inv.amount }), { secret: SECRETS.UB001 });
    expect(res.status).toBe(401);
    expect(res.body.status).toBe('INVALID_SIGNATURE');
    expect((await h.prisma.invoice.findUniqueOrThrow({ where: { id: inv.id } })).status).toBe('UNPAID');
  });

  it('a validly signed event for institution A cannot touch institution B\'s invoice', async () => {
    const ubOnly = await makeInvoice(h, { code: 'UB001', number: 'UB-ONLY-1', amount: 1_000_000 });
    const res = await deliver(h, evtPayload({ code: 'UM001', invoice: 'UB-ONLY-1', amount: 1_000_000 }));
    expect(res.status).toBe(404);
    expect(res.body.status).toBe('INVOICE_NOT_FOUND');
    expect((await h.prisma.invoice.findUniqueOrThrow({ where: { id: ubOnly.id } })).status).toBe('UNPAID');
  });

  it('unknown-institution notifications go to the restricted platform table and are invisible to every tenant admin', async () => {
    const body = evtPayload({ code: 'XX999', invoice: 'UKT-2026-0001', amount: 1000, id: 'evt_unknown_inst_1' });
    const res = await deliver(h, body, { secret: 'whatever' });
    expect(res.status).toBe(404);
    expect(res.body.status).toBe('UNKNOWN_INSTITUTION');
    expect(await h.prisma.platformSecurityEvent.count({ where: { institutionCodeClaimed: 'XX999' } })).toBe(1);
    for (const c of [um, ub]) {
      const events = (await c.get('/webhooks/events?limit=500')).body;
      expect(events.some((e: { eventId: string }) => e.eventId === 'evt_unknown_inst_1')).toBe(false);
    }
  });

  it('no API response ever contains an HMAC secret', async () => {
    const bodies = JSON.stringify([
      (await um.get('/institutions')).body, (await um.get('/auth/me')).body, (await um.get('/webhooks/events')).body,
      (await um.get('/invoices')).body, (await um.get('/transactions')).body, (await ub.get('/semesters')).body,
    ]);
    for (const s of Object.values(SECRETS)) expect(bodies).not.toContain(s);
    expect(bodies).not.toMatch(/hmacSecret/i);
  });

  it('the stored secret is encrypted at rest', async () => {
    const row = await h.prisma.institution.findUniqueOrThrow({ where: { code: 'UM001' } });
    expect(row.hmacSecretEnc.startsWith('v1:')).toBe(true);
    expect(row.hmacSecretEnc).not.toContain(SECRETS.UM001);
  });

  it('a ciphertext copied onto another institution does not decrypt (AAD bound to institution id)', async () => {
    const { SecretBox } = await import('../src/common/secret-box');
    const box = new SecretBox(Buffer.alloc(32, 7));
    const a = await h.prisma.institution.findUniqueOrThrow({ where: { code: 'UM001' } });
    const b = await h.prisma.institution.findUniqueOrThrow({ where: { code: 'UB001' } });
    expect(box.decrypt(a.hmacSecretEnc, a.id)).toBe(SECRETS.UM001);
    expect(() => box.decrypt(a.hmacSecretEnc, b.id)).toThrow();
  });
});
