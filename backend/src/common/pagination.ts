import { BadRequestException } from '@nestjs/common';
import type { Response } from 'express';

export interface Page { limit: number; offset: number }
const DEFAULT_LIMIT = 200;
const MAX_LIMIT = 500;

/** Parses ?limit & ?offset defensively. Collections stay plain arrays (frontend contract); the total goes in X-Total-Count. */
export function parsePage(q: { limit?: unknown; offset?: unknown }): Page {
  const num = (v: unknown, d: number, name: string) => {
    if (v === undefined || v === '') return d;
    const n = Number(v);
    if (!Number.isInteger(n) || n < 0) throw new BadRequestException(`${name} must be a non-negative integer.`);
    return n;
  };
  const limit = Math.min(Math.max(num(q.limit, DEFAULT_LIMIT, 'limit'), 1), MAX_LIMIT);
  return { limit, offset: num(q.offset, 0, 'offset') };
}

export function setTotal(res: Response, total: number) {
  res.setHeader('X-Total-Count', String(total));
}
