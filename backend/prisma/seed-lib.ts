import * as argon2 from 'argon2';
import { randomBytes, randomUUID } from 'node:crypto';
import { PrismaClient, type PaymentStatus } from '@prisma/client';
import { SecretBox } from '../src/common/secret-box';
import { sign } from '../src/webhooks/signature';

export interface SeedOptions {
  box: SecretBox;
  /** Plain HMAC secrets by institution code. Missing codes get a freshly generated random secret. */
  secrets?: Record<string, string>;
  demoPassword: string;
}

const ARGON = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 } as const;

const INSTITUTIONS = [
  { code: 'UM001', name: 'Universitas Negeri Malang' },
  { code: 'UB001', name: 'Universitas Brawijaya' },
  { code: 'UI001', name: 'Universitas Indonesia' },
];

const SEMESTERS = [
  { value: 'Ganjil 2026/2027', label: 'Odd Semester 2026/2027', current: true },
  { value: 'Genap 2026/2027', label: 'Even Semester 2026/2027', current: false },
  { value: 'Genap 2025/2026', label: 'Even Semester 2025/2026', current: false },
  { value: 'Ganjil 2025/2026', label: 'Odd Semester 2025/2026', current: false },
];

// key -> student
const STUDENTS = [
  { key: 'um1', inst: 'UM001', nim: '2310111208', name: 'Nadia Putri Ramadhani', program: 'Management', faculty: 'Faculty of Economics and Business', email: 'nadia.putri@student.um.ac.id' },
  { key: 'um2', inst: 'UM001', nim: '2210501042', name: 'Muhammad Farhan Akbar', program: 'Informatics Engineering', faculty: 'Faculty of Engineering', email: 'farhan.akbar@student.um.ac.id' },
  { key: 'um3', inst: 'UM001', nim: '2310312077', name: 'Salsabila Ayu Lestari', program: 'Communication Science', faculty: 'Faculty of Social Sciences', email: null },
  { key: 'ub1', inst: 'UB001', nim: '2110203091', name: 'Rizky Aditya Pratama', program: 'Medical Education', faculty: 'Faculty of Medicine', email: 'rizky.aditya@student.ub.ac.id' },
  { key: 'ub2', inst: 'UB001', nim: '2210403015', name: 'Citra Maharani Dewi', program: 'Law', faculty: 'Faculty of Law', email: null },
  { key: 'ui1', inst: 'UI001', nim: '2306201005', name: 'Dimas Prasetyo Nugroho', program: 'Computer Science', faculty: 'Faculty of Computer Science', email: 'dimas.prasetyo@student.ui.ac.id' },
];

const ADMINS = [
  { inst: 'UM001', name: 'Andi Firmansyah', email: 'admin.keuangan@um.ac.id' },
  { inst: 'UB001', name: 'Dewi Anggraini', email: 'admin.keuangan@ub.ac.id' },
  { inst: 'UI001', name: 'Bambang Hartono', email: 'admin.keuangan@ui.ac.id' },
];

// Invoice numbers are unique per institution but intentionally repeat across institutions.
const INVOICES: { inst: string; no: string; st: string; sem: string; amount: number; issued: string; expires: string; status: PaymentStatus; evt?: number; at?: string }[] = [
  { inst: 'UM001', no: 'UKT-2026-0001', st: 'um1', sem: 'Ganjil 2026/2027', amount: 6500000, issued: '2026-08-01', expires: '2026-12-15', status: 'UNPAID' },
  { inst: 'UM001', no: 'UKT-2026-0002', st: 'um2', sem: 'Ganjil 2026/2027', amount: 7250000, issued: '2026-08-01', expires: '2026-12-15', status: 'PAID', evt: 101, at: '2026-09-03T10:12:00+07:00' },
  { inst: 'UM001', no: 'UKT-2026-0003', st: 'um3', sem: 'Ganjil 2026/2027', amount: 5750000, issued: '2026-08-01', expires: '2026-10-15', status: 'EXPIRED', evt: 102, at: '2026-10-15T23:59:00+07:00' },
  { inst: 'UM001', no: 'UKT-2026-0004', st: 'um1', sem: 'Genap 2025/2026', amount: 6500000, issued: '2026-02-01', expires: '2026-03-15', status: 'PAID', evt: 103, at: '2026-02-20T14:20:00+07:00' },
  { inst: 'UB001', no: 'UKT-2026-0001', st: 'ub1', sem: 'Ganjil 2026/2027', amount: 12500000, issued: '2026-08-01', expires: '2026-12-20', status: 'UNPAID' },
  { inst: 'UB001', no: 'UKT-2026-0002', st: 'ub2', sem: 'Ganjil 2026/2027', amount: 6000000, issued: '2026-08-01', expires: '2026-10-20', status: 'EXPIRED', evt: 104, at: '2026-10-20T23:59:00+07:00' },
  { inst: 'UI001', no: 'UKT-2026-0001', st: 'ui1', sem: 'Ganjil 2026/2027', amount: 8000000, issued: '2026-08-01', expires: '2026-12-10', status: 'PAID', evt: 105, at: '2026-09-10T09:42:00+07:00' },
];

/** Idempotent: does nothing when institutions already exist. Returns the plaintext secrets only for NEWLY created institutions. */
export async function seedDatabase(prisma: PrismaClient, opts: SeedOptions): Promise<{ created: boolean; secrets: Record<string, string> }> {
  if ((await prisma.institution.count()) > 0) return { created: false, secrets: {} };

  const passwordHash = await argon2.hash(opts.demoPassword, ARGON);
  const secrets: Record<string, string> = {};
  const inst: Record<string, { id: string; secret: string }> = {};

  for (const i of INSTITUTIONS) {
    const id = randomUUID();
    const secret = opts.secrets?.[i.code] ?? randomBytes(32).toString('hex');
    secrets[i.code] = secret;
    inst[i.code] = { id, secret };
    await prisma.institution.create({ data: { id, code: i.code, name: i.name, hmacSecretEnc: opts.box.encrypt(secret, id) } });
    await prisma.semester.createMany({ data: SEMESTERS.map((s) => ({ ...s, institutionId: id })) });
  }

  const studentId: Record<string, string> = {};
  for (const s of STUDENTS) {
    const id = randomUUID();
    studentId[s.key] = id;
    await prisma.student.create({ data: { id, institutionId: inst[s.inst].id, nim: s.nim, name: s.name, program: s.program, faculty: s.faculty } });
    if (s.email) {
      await prisma.user.create({ data: { institutionId: inst[s.inst].id, studentId: id, email: s.email, name: s.name, role: 'STUDENT', passwordHash } });
    }
  }
  for (const a of ADMINS) {
    await prisma.user.create({ data: { institutionId: inst[a.inst].id, email: a.email, name: a.name, role: 'ADMIN', passwordHash } });
  }

  for (const v of INVOICES) {
    const i = inst[v.inst];
    const sem = await prisma.semester.findFirstOrThrow({ where: { institutionId: i.id, value: v.sem } });
    const invoice = await prisma.invoice.create({
      data: {
        institutionId: i.id, studentId: studentId[v.st], semesterId: sem.id, invoiceNumber: v.no, amount: BigInt(v.amount), status: v.status,
        issuedAt: new Date(`${v.issued}T00:00:00Z`), expiresAt: new Date(`${v.expires}T00:00:00Z`), paidAt: v.status === 'PAID' ? new Date(v.at!) : null,
      },
    });
    if (v.evt) {
      const type = v.status === 'PAID' ? 'payment.success' : 'payment.expired';
      const body = JSON.stringify({ event_id: `evt_${String(v.evt).padStart(6, '0')}`, event_type: type, institution_code: v.inst, invoice_number: v.no, amount: v.amount, occurred_at: v.at });
      const audit = await prisma.webhookEvent.create({
        data: {
          institutionId: i.id, institutionCode: v.inst, eventId: `evt_${String(v.evt).padStart(6, '0')}`, eventType: type, invoiceNumber: v.no, amount: BigInt(v.amount),
          occurredAt: new Date(v.at!), receivedAt: new Date(new Date(v.at!).getTime() + 3000), rawBody: body, signature: sign(i.secret, body), signatureValid: true, processingStatus: 'PROCESSED', httpStatus: 200,
        },
      });
      await prisma.transaction.create({
        data: { institutionId: i.id, invoiceId: invoice.id, webhookEventId: audit.id, eventId: audit.eventId!, type: v.status === 'PAID' ? 'PAYMENT_SUCCESS' : 'PAYMENT_EXPIRED', amount: BigInt(v.amount), resultingStatus: v.status, occurredAt: new Date(v.at!) },
      });
    }
  }

  // A few realistic rejected deliveries so the monitoring page has something to show on first launch.
  const um = inst['UM001'];
  const rejected = async (status: 'DUPLICATE' | 'INVALID_SIGNATURE' | 'INVOICE_NOT_FOUND', http: number, evt: string, no: string, amount: number, at: string, msg: string, goodSig: boolean) => {
    const body = JSON.stringify({ event_id: evt, event_type: 'payment.success', institution_code: 'UM001', invoice_number: no, amount, occurred_at: at });
    await prisma.webhookEvent.create({
      data: {
        institutionId: um.id, institutionCode: 'UM001', eventId: evt, eventType: 'payment.success', invoiceNumber: no, amount: BigInt(amount), occurredAt: new Date(at),
        receivedAt: new Date(new Date(at).getTime() + 2000), rawBody: body, signature: goodSig ? sign(um.secret, body) : 'sha256=' + '0'.repeat(64), signatureValid: goodSig,
        processingStatus: status, httpStatus: http, errorMessage: msg,
      },
    });
  };
  await rejected('DUPLICATE', 200, 'evt_000101', 'UKT-2026-0002', 7250000, '2026-09-03T10:12:00+07:00', 'Event evt_000101 was already processed; the repeat was ignored.', true);
  await rejected('INVALID_SIGNATURE', 401, 'evt_000106', 'UKT-2026-0001', 6500000, '2026-09-04T08:01:00+07:00', 'The X-Signature header did not match the HMAC of the request body.', false);
  await rejected('INVOICE_NOT_FOUND', 404, 'evt_000107', 'UKT-2026-8888', 6000000, '2026-09-05T11:30:00+07:00', 'No invoice UKT-2026-8888 exists for institution UM001.', true);

  return { created: true, secrets };
}

export const DEMO_ACCOUNTS = [
  ...ADMINS.map((a) => ({ role: 'ADMIN', institution: a.inst, email: a.email })),
  ...STUDENTS.filter((s) => s.email).map((s) => ({ role: 'STUDENT', institution: s.inst, email: s.email! })),
];
