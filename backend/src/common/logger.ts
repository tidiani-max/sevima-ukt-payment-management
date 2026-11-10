import { LoggerService } from '@nestjs/common';

const LEVELS = { debug: 10, info: 20, warn: 30, error: 40 } as const;
export type Level = keyof typeof LEVELS;
const REDACT = /(password|secret|authorization|cookie|signature|token|sid)$/i;

function redact(v: unknown, depth = 0): unknown {
  if (depth > 4 || v === null || typeof v !== 'object') return v;
  if (Array.isArray(v)) return v.map((x) => redact(x, depth + 1));
  return Object.fromEntries(Object.entries(v as object).map(([k, x]) => [k, REDACT.test(k) ? '[REDACTED]' : redact(x, depth + 1)]));
}

/** Structured one-line JSON logger. Fields whose names look secret-ish are redacted defensively. */
export class JsonLogger implements LoggerService {
  constructor(private readonly min: Level = 'info') {}

  private write(level: Level, message: unknown, ctx?: string, extra?: Record<string, unknown>) {
    if (LEVELS[level] < LEVELS[this.min]) return;
    const line = { time: new Date().toISOString(), level, ctx, msg: typeof message === 'string' ? message : redact(message), ...(redact(extra) as object) };
    (level === 'error' ? process.stderr : process.stdout).write(JSON.stringify(line) + '\n');
  }
  log(m: unknown, ctx?: string) { this.write('info', m, ctx); }
  error(m: unknown, trace?: string, ctx?: string) { this.write('error', m, ctx, trace ? { trace } : undefined); }
  warn(m: unknown, ctx?: string) { this.write('warn', m, ctx); }
  debug(m: unknown, ctx?: string) { this.write('debug', m, ctx); }
  verbose(m: unknown, ctx?: string) { this.write('debug', m, ctx); }
  /** Structured event with arbitrary fields (request id, webhook event id, ...). */
  event(level: Level, msg: string, fields: Record<string, unknown>) { this.write(level, msg, undefined, fields); }
}

export const logger = new JsonLogger((process.env.LOG_LEVEL as Level) ?? (process.env.NODE_ENV === 'test' ? 'error' : 'info'));
