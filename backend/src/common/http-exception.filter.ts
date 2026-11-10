import { ArgumentsHost, Catch, ExceptionFilter, HttpException, HttpStatus } from '@nestjs/common';
import type { Request, Response } from 'express';
import { logger } from './logger';

/** Single error shape for the whole API: { statusCode, message (string), errors?, requestId }. Internals never leak. */
@Catch()
export class AllExceptionsFilter implements ExceptionFilter {
  catch(exception: unknown, host: ArgumentsHost) {
    const http = host.switchToHttp();
    const res = http.getResponse<Response>();
    const req = http.getRequest<Request>();
    let status = HttpStatus.INTERNAL_SERVER_ERROR;
    let message = 'Something went wrong on our side. Please try again.';
    let errors: string[] | undefined;

    if (exception instanceof HttpException) {
      status = exception.getStatus();
      const body = exception.getResponse();
      if (typeof body === 'string') message = body;
      else {
        const b = body as { message?: string | string[] };
        if (Array.isArray(b.message)) { errors = b.message; message = b.message[0] ?? 'Invalid request.'; }
        else if (b.message) message = b.message;
      }
    } else if ((exception as { type?: string })?.type === 'entity.too.large') {
      status = HttpStatus.PAYLOAD_TOO_LARGE; message = 'Request body is too large.';
    } else if ((exception as { type?: string })?.type === 'entity.parse.failed') {
      status = HttpStatus.BAD_REQUEST; message = 'Request body is not valid JSON.';
    }

    if (status >= 500) {
      const e = exception as Error;
      logger.event('error', 'unhandled_exception', { requestId: req.id, path: req.path, error: e?.message, stack: e?.stack });
    }
    res.status(status).json({ statusCode: status, message, ...(errors ? { errors } : {}), requestId: req.id });
  }
}
