import { ACCOUNTS, boot, Client, Harness, login } from './helpers';

describe('Invoices', () => {
  let h: Harness;
  let um: Client, ub: Client, nadia: Client;
  let umStudents: { id: string; nim: string }[];
  let ubStudents: { id: string; nim: string }[];
  const valid = (studentId: string, over: Record<string, unknown> = {}) => ({
    studentId, invoiceNumber: 'UKT-NEW-1', semester: 'Genap 2026/2027', amount: 5_000_000, issuedAt: '2026-11-09', expiresAt: '2027-01-31', ...over,
  });

  beforeAll(async () => {
    h = await boot();
    um = await login(h, ACCOUNTS.umAdmin); ub = await login(h, ACCOUNTS.ubAdmin); nadia = await login(h, ACCOUNTS.nadia);
    umStudents = (await um.get('/students')).body; ubStudents = (await ub.get('/students')).body;
  });
  afterAll(async () => { await h.close(); });

  it('creates an invoice: starts UNPAID, institution derived from the session, persisted in PostgreSQL', async () => {
    const res = await um.post('/invoices', valid(umStudents[0].id));
    expect(res.status).toBe(201);
    expect(res.body).toMatchObject({ invoiceNumber: 'UKT-NEW-1', status: 'UNPAID', amount: 5_000_000, semester: 'Genap 2026/2027', institutionId: um.session.institution.id });
    const row = await h.prisma.invoice.findUnique({ where: { id: res.body.id } });
    expect(row?.institutionId).toBe(um.session.institution.id);
    expect(row?.status).toBe('UNPAID');
  });

  it('rejects a duplicate invoice number within the same institution (409)', async () => {
    const res = await um.post('/invoices', valid(umStudents[1].id));
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/already used/i);
  });

  it('allows the same invoice number in a different institution', async () => {
    const res = await ub.post('/invoices', valid(ubStudents[0].id));
    expect(res.status).toBe(201);
    expect(res.body.invoiceNumber).toBe('UKT-NEW-1');
  });

  it('refuses a second active invoice for the same student and semester (409)', async () => {
    const res = await um.post('/invoices', valid(umStudents[0].id, { invoiceNumber: 'UKT-NEW-2' }));
    expect(res.status).toBe(409);
    expect(res.body.message).toMatch(/active invoice/i);
  });

  it.each([
    ['zero', 0], ['negative', -5], ['fractional', 1500.5], ['string', '5000'], ['absurdly large', 10 ** 13], ['null', null],
  ])('rejects an invalid amount: %s', async (_n, amount) => {
    const res = await um.post('/invoices', valid(umStudents[2].id, { invoiceNumber: `BAD-${String(_n).replace(/\W/g, '')}`, amount }));
    expect(res.status).toBe(400);
  });

  it('rejects invalid expiration dates', async () => {
    const id = umStudents[2].id;
    expect((await um.post('/invoices', valid(id, { invoiceNumber: 'D1', expiresAt: '2026-10-01' }))).status).toBe(422); // before issue date
    expect((await um.post('/invoices', valid(id, { invoiceNumber: 'D2', issuedAt: '2020-01-01', expiresAt: '2020-02-01' }))).status).toBe(422); // in the past
    expect((await um.post('/invoices', valid(id, { invoiceNumber: 'D3', expiresAt: '2027-02-30' }))).status).toBe(422); // not a real date
    expect((await um.post('/invoices', valid(id, { invoiceNumber: 'D4', expiresAt: 'tomorrow' }))).status).toBe(400); // bad format
  });

  it('rejects a student from another institution as not found, and an unknown semester', async () => {
    const foreign = await um.post('/invoices', valid(ubStudents[0].id, { invoiceNumber: 'X-1' }));
    expect(foreign.status).toBe(404);
    expect((await um.post('/invoices', valid(umStudents[2].id, { invoiceNumber: 'X-2', semester: 'Nope 1999' }))).status).toBe(422);
  });

  it('refuses a client-supplied institutionId (never trusted)', async () => {
    const res = await um.post('/invoices', valid(umStudents[2].id, { invoiceNumber: 'X-3', institutionId: ub.session.institution.id }));
    expect(res.status).toBe(400);
  });

  it('only finance administrators may create invoices; unauthenticated is 401', async () => {
    expect((await nadia.post('/invoices', valid(umStudents[2].id, { invoiceNumber: 'X-4' }))).status).toBe(403);
  });

  it('lists with status filter and pagination headers', async () => {
    const all = await um.get('/invoices');
    expect(all.status).toBe(200);
    expect(Number(all.headers['x-total-count'])).toBe(all.body.length);
    const unpaid = await um.get('/invoices?status=UNPAID');
    expect(unpaid.body.every((i: { status: string }) => i.status === 'UNPAID')).toBe(true);
    const page = await um.get('/invoices?limit=2&offset=0');
    expect(page.body).toHaveLength(2);
    expect(Number(page.headers['x-total-count'])).toBe(all.body.length);
    expect((await um.get('/invoices?status=BOGUS')).status).toBe(400);
    expect((await um.get('/invoices?limit=-1')).status).toBe(400);
  });

  it('students see only their own invoices; GET /invoices/:id enforces ownership', async () => {
    const mine = await nadia.get('/me/invoices');
    expect(mine.status).toBe(200);
    expect(mine.body.length).toBeGreaterThan(0);
    expect(mine.body.every((i: { studentId: string }) => i.studentId === nadia.session.user.studentId)).toBe(true);
    const own = await nadia.get(`/invoices/${mine.body[0].id}`);
    expect(own.status).toBe(200);
    const others = (await um.get('/invoices')).body.filter((i: { studentId: string }) => i.studentId !== nadia.session.user.studentId);
    expect((await nadia.get(`/invoices/${others[0].id}`)).status).toBe(404);
  });

  it('the database itself rejects a cross-tenant invoice (composite foreign key)', async () => {
    const inst = await h.prisma.institution.findUniqueOrThrow({ where: { code: 'UM001' } });
    const sem = await h.prisma.semester.findFirstOrThrow({ where: { institutionId: inst.id } });
    await expect(
      h.prisma.invoice.create({ data: { institutionId: inst.id, studentId: ubStudents[0].id, semesterId: sem.id, invoiceNumber: 'RAW-1', amount: 1n, issuedAt: new Date(), expiresAt: new Date() } }),
    ).rejects.toThrow();
  });

  it('the database rejects non-positive amounts even if application validation were bypassed', async () => {
    const inst = await h.prisma.institution.findUniqueOrThrow({ where: { code: 'UM001' } });
    const sem = await h.prisma.semester.findFirstOrThrow({ where: { institutionId: inst.id } });
    await expect(
      h.prisma.invoice.create({ data: { institutionId: inst.id, studentId: umStudents[2].id, semesterId: sem.id, invoiceNumber: 'RAW-2', amount: 0n, issuedAt: new Date(), expiresAt: new Date() } }),
    ).rejects.toThrow();
  });
});
