import { PrismaPg } from '@prisma/adapter-pg';
import { PrismaClient } from '@prisma/client';
import { Pool } from 'pg';
import { loadEnv } from '../src/config/env';
import { SecretBox } from '../src/common/secret-box';
import { DEMO_ACCOUNTS, seedDatabase } from './seed-lib';

/**
 * `npm run seed` -- idempotent. Seeds 3 institutions with demo data.
 * HMAC secrets come from HMAC_SECRET_<CODE> env vars if set (so you can share them with a gateway out-of-band),
 * otherwise random ones are generated. Retrieve them any time with `npm run secrets:show` (non-production only).
 */
async function main() {
  const env = loadEnv();
  if (env.appEnv === 'production' && process.env.SEED_DEMO_DATA !== 'true') {
    console.log('[seed] APP_ENV=production and SEED_DEMO_DATA is not "true": skipping demo data.');
    return;
  }
  const pool = new Pool({ connectionString: env.databaseUrl, max: 2 });
  const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });
  try {
    const secrets = Object.fromEntries(['UM001', 'UB001', 'UI001'].flatMap((c) => (process.env[`HMAC_SECRET_${c}`] ? [[c, process.env[`HMAC_SECRET_${c}`]!]] : [])));
    const demoPassword = process.env.DEMO_PASSWORD;
    if (!demoPassword || demoPassword.length < 8) throw new Error('DEMO_PASSWORD (min 8 chars) is required to seed demo users');
    const r = await seedDatabase(prisma, { box: new SecretBox(env.secretsEncryptionKey), secrets, demoPassword });
    console.log(r.created ? `[seed] seeded 3 institutions. Demo accounts:\n${DEMO_ACCOUNTS.map((a) => `  ${a.role.padEnd(7)} ${a.institution}  ${a.email}`).join('\n')}` : '[seed] database already seeded; nothing to do.');
  } finally {
    await prisma.$disconnect();
    await pool.end();
  }
}
main().catch((e) => { console.error('[seed] failed:', e); process.exit(1); });
