import { loadEnv } from '../config/env';
import { SecretBox } from './secret-box';
import { isRealDate, jakartaToday } from '../invoices/invoices.service';
import { parsePage } from './pagination';

describe('SecretBox', () => {
  const box = new SecretBox(Buffer.alloc(32, 1));
  it('round-trips, uses a fresh IV per encryption, and binds the AAD', () => {
    const a = box.encrypt('hello', 'inst-1'), b = box.encrypt('hello', 'inst-1');
    expect(a).not.toBe(b);
    expect(box.decrypt(a, 'inst-1')).toBe('hello');
    expect(() => box.decrypt(a, 'inst-2')).toThrow();
  });
  it('detects tampering and a wrong key', () => {
    const a = box.encrypt('hello', 'x');
    const t = a.split(':'); t[3] = Buffer.from('zzzz').toString('base64url');
    expect(() => box.decrypt(t.join(':'), 'x')).toThrow();
    expect(() => new SecretBox(Buffer.alloc(32, 2)).decrypt(a, 'x')).toThrow();
    expect(() => new SecretBox(Buffer.alloc(8))).toThrow();
  });
});

describe('env validation', () => {
  const base = { DATABASE_URL: 'postgresql://u:p@db/x', SESSION_SECRET: 'x'.repeat(40), SECRETS_ENCRYPTION_KEY: Buffer.alloc(32, 3).toString('base64') };
  it('requires secrets', () => {
    expect(() => loadEnv({ ...base, SESSION_SECRET: '' } as NodeJS.ProcessEnv)).toThrow(/SESSION_SECRET/);
    expect(() => loadEnv({ ...base, SECRETS_ENCRYPTION_KEY: 'AAAA' } as NodeJS.ProcessEnv)).toThrow(/32 bytes/);
  });
  it('production forbids the mock gateway, insecure cookies and placeholder secrets', () => {
    const prod = { ...base, APP_ENV: 'production', COOKIE_SECURE: 'true', MOCK_GATEWAY_ENABLED: 'false' } as NodeJS.ProcessEnv;
    expect(loadEnv(prod).mockGatewayEnabled).toBe(false);
    expect(() => loadEnv({ ...prod, MOCK_GATEWAY_ENABLED: 'true' })).toThrow(/MOCK_GATEWAY/);
    expect(() => loadEnv({ ...prod, COOKIE_SECURE: 'false' })).toThrow(/COOKIE_SECURE/);
    expect(() => loadEnv({ ...prod, SESSION_SECRET: 'dev-only-' + 'x'.repeat(40) })).toThrow(/placeholder/);
  });
  it('mock gateway defaults to OFF in production and ON elsewhere', () => {
    expect(loadEnv({ ...base, APP_ENV: 'development' } as NodeJS.ProcessEnv).mockGatewayEnabled).toBe(true);
    expect(() => loadEnv({ ...base, APP_ENV: 'production', COOKIE_SECURE: 'true' } as NodeJS.ProcessEnv)).not.toThrow();
  });
});

describe('dates and pagination', () => {
  it('isRealDate', () => { expect(isRealDate('2026-02-28')).toBe(true); expect(isRealDate('2026-02-30')).toBe(false); expect(isRealDate('2026-13-01')).toBe(false); });
  it('jakartaToday rolls over at 17:00 UTC', () => {
    expect(jakartaToday(new Date('2026-11-08T16:59:00Z'))).toBe('2026-11-08');
    expect(jakartaToday(new Date('2026-11-08T17:00:00Z'))).toBe('2026-11-09');
  });
  it('parsePage clamps and validates', () => {
    expect(parsePage({})).toEqual({ limit: 200, offset: 0 });
    expect(parsePage({ limit: '99999' }).limit).toBe(500);
    expect(() => parsePage({ limit: 'abc' })).toThrow();
    expect(() => parsePage({ offset: '-3' })).toThrow();
  });
});
