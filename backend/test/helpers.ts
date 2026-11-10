import { INestApplication } from '@nestjs/common';
import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { randomUUID } from 'node:crypto';
import { Pool } from 'pg';
import request from 'supertest';
import { createApp } from '../src/app.factory';
import { SecretBox } from '../src/common/secret-box';
import { loadEnv } from '../src/config/env';
import { seedDatabase } from '../prisma/seed-lib';
import { sign } from '../src/webhooks/signature';

export const SECRETS = {
  UM001: 'test-secret-UM001-aaaaaaaaaaaaaaaa',
  UB001: 'test-secret-UB001-bbbbbbbbbbbbbbbb',
  UI001: 'test-secret-UI001-cccccccccccccccc',
} as const;
export const PASSWORD = 'demosevima';
export const ACCOUNTS = {
  umAdmin: 'admin.keuangan@um.ac.id',
  ubAdmin: 'admin.keuangan@ub.ac.id',
  uiAdmin: 'admin.keuangan@ui.ac.id',
  nadia: 'nadia.putri@student.um.ac.id', // UM student 1 (nim 2310111208)
  farhan: 'farhan.akbar@student.um.ac.id', // UM student 2 (nim 2210501042)
  rizky: 'rizky.aditya@student.ub.ac.id', // UB student
} as const;

export interface Harness {
  app: INestApplication;
  prisma: PrismaClient;
  close: () => Promise<void>;
}

/** Boots the REAL application (same middleware stack as production) on a real port, against the test database. */
export async function boot(): Promise<Harness> {
  const pool = new Pool({ connectionString: process.env.DATABASE_URL, max: 5 });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  await reset(prisma);
  const app = await createApp();
  await app.listen(Number(process.env.PORT));
  return {
    app,
    prisma,
    close: async () => {
      await app.close();
      await prisma.$disconnect();
      await pool.end();
    },
  };
}

/** Wipes everything and re-seeds the 3 demo institutions with KNOWN secrets (so tests can sign payloads). */
export async function reset(prisma: PrismaClient) {
  await prisma.$executeRawUnsafe(
    'TRUNCATE "Transaction","WebhookEvent","Invoice","Semester","User","Student","Institution","PlatformSecurityEvent","session","RateLimit" RESTART IDENTITY CASCADE',
  );
  await seedDatabase(prisma, { box: new SecretBox(loadEnv().secretsEncryptionKey), secrets: { ...SECRETS }, demoPassword: PASSWORD });
}

export interface Client {
  email: string;
  csrf: string;
  agent: ReturnType<typeof request.agent>;
  get: (p: string) => request.Test;
  post: (p: string, body?: object) => request.Test;
  session: { user: { id: string; role: string; institutionId: string; studentId?: string }; institution: { id: string; code: string } };
}

/** Logs in through the real endpoint; the agent keeps the HttpOnly session cookie, writes carry the CSRF token. */
export async function login(h: Harness, email: string, password = PASSWORD): Promise<Client> {
  const agent = request.agent(h.app.getHttpServer());
  const res = await agent.post('/api/auth/login').send({ email, password });
  if (res.status !== 200) throw new Error(`login failed for ${email}: ${res.status} ${JSON.stringify(res.body)}`);
  const cookies = ([] as string[]).concat(res.headers['set-cookie'] ?? []);
  const csrf = decodeURIComponent(cookies.find((c) => c.startsWith('XSRF-TOKEN='))!.split(';')[0].split('=')[1]);
  return {
    email,
    csrf,
    agent,
    session: res.body,
    get: (p) => agent.get(`/api${p}`),
    post: (p, body) => agent.post(`/api${p}`).set('X-CSRF-Token', csrf).send(body ?? {}),
  };
}

export const anon = (h: Harness) => request(h.app.getHttpServer());

let n = 0;
/**
 * Creates an invoice directly in the DB, each in a fresh semester so the one-active-invoice-per-student-semester
 * rule never interferes with unrelated tests.
 */
export async function makeInvoice(
  h: Harness,
  o: { code: 'UM001' | 'UB001' | 'UI001'; number?: string; amount?: number; nim?: string; status?: 'UNPAID' | 'PAID' | 'EXPIRED' },
) {
  const inst = await h.prisma.institution.findUniqueOrThrow({ where: { code: o.code } });
  const student = await h.prisma.student.findFirstOrThrow({
    where: { institutionId: inst.id, ...(o.nim ? { nim: o.nim } : {}) },
    orderBy: { nim: 'asc' },
  });
  const sem = await h.prisma.semester.create({
    data: { institutionId: inst.id, value: `T${++n}-${randomUUID().slice(0, 6)}`, label: 'Test semester' },
  });
  const number = o.number ?? `T-${o.code}-${Date.now()}-${n}`;
  const status = o.status ?? 'UNPAID';
  const amount = o.amount ?? 6_500_000;
  const invoice = await h.prisma.invoice.create({
    data: {
      institutionId: inst.id,
      studentId: student.id,
      semesterId: sem.id,
      invoiceNumber: number,
      amount: BigInt(amount),
      status,
      issuedAt: new Date('2026-08-01T00:00:00Z'),
      expiresAt: new Date('2026-12-31T00:00:00Z'),
      paidAt: status === 'PAID' ? new Date() : null,
    },
  });
  return { id: invoice.id, institutionId: inst.id, studentId: student.id, number, amount };
}

export const evtPayload = (o: {
  code: string;
  invoice: string;
  amount: number;
  type?: 'payment.success' | 'payment.expired';
  id?: string;
  at?: string;
}) => ({
  event_id: o.id ?? `evt_${randomUUID()}`,
  event_type: o.type ?? 'payment.success',
  institution_code: o.code,
  invoice_number: o.invoice,
  amount: o.amount,
  occurred_at: o.at ?? '2026-11-08T10:30:00+07:00',
});

/** Delivers a webhook like a real gateway: exact serialised bytes + X-Signature computed over those bytes. */
export function deliver(h: Harness, body: string | object, opts: { secret?: string; signature?: string | null; contentType?: string } = {}) {
  const raw = typeof body === 'string' ? body : JSON.stringify(body);
  const code = typeof body === 'object' ? (body as { institution_code?: keyof typeof SECRETS }).institution_code : undefined;
  const secret = opts.secret ?? (code && SECRETS[code]) ?? 'x';
  const t = request(h.app.getHttpServer()).post('/api/webhooks/payment').set('Content-Type', opts.contentType ?? 'application/json');
  if (opts.signature !== null) t.set('X-Signature', opts.signature ?? sign(secret, raw));
  return t.send(raw);
}
