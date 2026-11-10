import { ACCOUNTS, anon, boot, Harness, login, PASSWORD } from './helpers';

describe('Authentication & sessions', () => {
  let h: Harness;
  beforeAll(async () => { h = await boot(); });
  afterAll(async () => { await h.close(); });

  it('logs in a finance administrator and returns session + institution (no secrets, no hash)', async () => {
    const c = await login(h, ACCOUNTS.umAdmin);
    expect(c.session.user).toMatchObject({ email: ACCOUNTS.umAdmin, role: 'ADMIN' });
    expect(c.session.institution.code).toBe('UM001');
    expect(JSON.stringify(c.session)).not.toMatch(/passwordHash|argon2|hmac|secret/i);
  });

  it('sets an HttpOnly SameSite session cookie and a script-readable CSRF cookie', async () => {
    const res = await anon(h).post('/api/auth/login').send({ email: ACCOUNTS.nadia, password: PASSWORD });
    const cookies = ([] as string[]).concat(res.headers['set-cookie']);
    const sid = cookies.find((c) => c.startsWith('sid='))!;
    expect(sid).toMatch(/HttpOnly/i);
    expect(sid).toMatch(/SameSite=Lax/i);
    expect(cookies.find((c) => c.startsWith('XSRF-TOKEN='))).not.toMatch(/HttpOnly/i);
    expect(JSON.stringify(res.body)).not.toMatch(/csrf|"sid"/i);
  });

  it('rejects wrong password and unknown email with the same generic message', async () => {
    const bad = await anon(h).post('/api/auth/login').send({ email: ACCOUNTS.umAdmin, password: 'wrong-password' });
    const unknown = await anon(h).post('/api/auth/login').send({ email: 'nobody@nowhere.test', password: 'whatever1' });
    expect(bad.status).toBe(401);
    expect(unknown.status).toBe(401);
    expect(bad.body.message).toBe(unknown.body.message);
  });

  it('rejects unauthenticated access to protected endpoints', async () => {
    for (const p of ['/api/auth/me', '/api/invoices', '/api/transactions', '/api/webhooks/events', '/api/students', '/api/me/invoices']) {
      expect((await anon(h).get(p)).status).toBe(401);
    }
  });

  it('restores the session via GET /auth/me (browser refresh)', async () => {
    const c = await login(h, ACCOUNTS.nadia);
    const me = await c.get('/auth/me');
    expect(me.status).toBe(200);
    expect(me.body.user).toMatchObject({ email: ACCOUNTS.nadia, role: 'STUDENT' });
    expect(me.body.user.studentId).toBeDefined();
  });

  it('logout destroys the server-side session', async () => {
    const c = await login(h, ACCOUNTS.umAdmin);
    expect((await c.post('/auth/logout')).status).toBe(204);
    expect((await c.get('/auth/me')).status).toBe(401);
  });

  it('rejects an expired server-side session', async () => {
    const c = await login(h, ACCOUNTS.umAdmin);
    expect((await c.get('/auth/me')).status).toBe(200);
    await h.prisma.$executeRawUnsafe(`UPDATE "session" SET "expire" = now() - interval '1 minute'`);
    expect((await c.get('/auth/me')).status).toBe(401);
  });

  it('rejects a session older than the absolute lifetime even if still active', async () => {
    const c = await login(h, ACCOUNTS.umAdmin);
    await h.prisma.$executeRawUnsafe(
      `UPDATE "session" SET sess = jsonb_set(sess::jsonb, '{createdAt}', to_jsonb((extract(epoch from now())*1000)::bigint - 13*3600*1000))::json`,
    );
    expect((await c.get('/auth/me')).status).toBe(401);
  });

  it('issues a new session id at every login (fixation protection)', async () => {
    const sid = (r: { headers: Record<string, unknown> }) => ([] as string[]).concat(r.headers['set-cookie'] as string[]).find((c) => c.startsWith('sid='))!.split(';')[0];
    const a = await anon(h).post('/api/auth/login').send({ email: ACCOUNTS.umAdmin, password: PASSWORD });
    const b = await anon(h).post('/api/auth/login').send({ email: ACCOUNTS.umAdmin, password: PASSWORD });
    expect(sid(a)).not.toBe(sid(b));
  });

  it('a student cannot perform administrator operations', async () => {
    const c = await login(h, ACCOUNTS.nadia);
    expect((await c.post('/invoices', {})).status).toBe(403);
    expect((await c.get('/invoices')).status).toBe(403);
    expect((await c.get('/students')).status).toBe(403);
    expect((await c.get('/transactions')).status).toBe(403);
    expect((await c.get('/webhooks/events')).status).toBe(403);
    expect((await c.post('/dev/webhooks/simulate', { payload: {} })).status).toBe(403);
  });

  it('CSRF: writes without a matching token are refused despite a valid session cookie', async () => {
    const c = await login(h, ACCOUNTS.umAdmin);
    expect((await c.agent.post('/api/invoices').send({})).status).toBe(403);
    expect((await c.agent.post('/api/invoices').set('X-CSRF-Token', 'f'.repeat(64)).send({})).status).toBe(403);
  });

  it('rate-limits repeated failed logins per account (429) without locking other accounts', async () => {
    let last = 0;
    for (let i = 0; i < 10; i++) last = (await anon(h).post('/api/auth/login').send({ email: ACCOUNTS.uiAdmin, password: `bad-password-${i}` })).status;
    expect(last).toBe(429);
    expect((await anon(h).post('/api/auth/login').send({ email: ACCOUNTS.ubAdmin, password: PASSWORD })).status).toBe(200);
  });

  it('is case-insensitive on email and rejects malformed bodies with 400', async () => {
    expect((await anon(h).post('/api/auth/login').send({ email: ACCOUNTS.rizky.toUpperCase(), password: PASSWORD })).status).toBe(200);
    expect((await anon(h).post('/api/auth/login').send({ email: 123 })).status).toBe(400);
  });
});
