import { randomUUID } from 'node:crypto';
import type { NextFunction, Request, Response } from 'express';
import { logger } from './logger';

/** Correlation id (accepts a sane inbound X-Request-Id, otherwise generates one) + one structured access-log line. */
export function requestContext(req: Request, res: Response, next: NextFunction) {
  const inbound = req.header('x-request-id');
  req.id = inbound && /^[\w.-]{8,64}$/.test(inbound) ? inbound : randomUUID();
  res.setHeader('X-Request-Id', req.id);
  const started = process.hrtime.bigint();
  res.on('finish', () => {
    if (req.path === '/api/health') return;
    logger.event(res.statusCode >= 500 ? 'error' : 'info', 'http_request', {
      requestId: req.id, method: req.method, path: req.path, status: res.statusCode,
      ms: Number((process.hrtime.bigint() - started) / 1_000_000n), userId: req.auth?.userId,
    });
  });
  next();
}
