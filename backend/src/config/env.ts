/** Central, validated runtime configuration. Fails fast on boot rather than misbehaving later. */
export type AppEnv = 'development' | 'test' | 'demo' | 'production';

export interface Env {
  appEnv: AppEnv;
  port: number;
  databaseUrl: string;
  sessionSecret: string;
  secretsEncryptionKey: Buffer;
  cookieSecure: boolean;
  sessionIdleMinutes: number;
  sessionAbsoluteHours: number;
  mockGatewayEnabled: boolean;
  /** Where the mock gateway delivers webhooks. Defaults to this very process. */
  webhookTargetUrl: string;
  dbPoolMax: number;
  trustProxy: boolean;
  logLevel: 'debug' | 'info' | 'warn' | 'error';
}

const bool = (v: string | undefined, d: boolean) => (v === undefined || v === '' ? d : ['1', 'true', 'yes'].includes(v.toLowerCase()));

export function loadEnv(src: NodeJS.ProcessEnv = process.env): Env {
  const appEnv = (src.APP_ENV ?? (src.NODE_ENV === 'test' ? 'test' : 'development')) as AppEnv;
  if (!['development', 'test', 'demo', 'production'].includes(appEnv)) throw new Error(`Invalid APP_ENV "${appEnv}"`);

  const need = (k: string): string => {
    const v = src[k];
    if (!v) throw new Error(`Missing required environment variable ${k}`);
    return v;
  };

  const key = Buffer.from(need('SECRETS_ENCRYPTION_KEY'), 'base64');
  if (key.length !== 32) throw new Error('SECRETS_ENCRYPTION_KEY must be 32 bytes, base64-encoded');
  const sessionSecret = need('SESSION_SECRET');
  if (sessionSecret.length < 32) throw new Error('SESSION_SECRET must be at least 32 characters');

  const port = Number(src.PORT ?? 3000);
  const mockGatewayEnabled = bool(src.MOCK_GATEWAY_ENABLED, appEnv !== 'production');
  const cookieSecure = bool(src.COOKIE_SECURE, appEnv === 'production');

  if (appEnv === 'production') {
    if (mockGatewayEnabled) throw new Error('MOCK_GATEWAY_ENABLED must be false when APP_ENV=production');
    if (!cookieSecure) throw new Error('COOKIE_SECURE must be true when APP_ENV=production');
    if (/dev-only|change[-_]?me/i.test(sessionSecret) || /dev-only|change[-_]?me/i.test(src.DATABASE_URL ?? '')) {
      throw new Error('Refusing to start in production with placeholder (dev-only / change-me) secrets');
    }
  }

  return {
    appEnv,
    port,
    databaseUrl: need('DATABASE_URL'),
    sessionSecret,
    secretsEncryptionKey: key,
    cookieSecure,
    sessionIdleMinutes: Number(src.SESSION_IDLE_MINUTES ?? 60),
    sessionAbsoluteHours: Number(src.SESSION_ABSOLUTE_HOURS ?? 12),
    mockGatewayEnabled,
    webhookTargetUrl: src.WEBHOOK_TARGET_URL ?? `http://127.0.0.1:${port}/api/webhooks/payment`,
    dbPoolMax: Number(src.DB_POOL_MAX ?? 10),
    trustProxy: bool(src.TRUST_PROXY, true),
    logLevel: (src.LOG_LEVEL as Env['logLevel']) ?? (appEnv === 'test' ? 'error' : 'info'),
  };
}
