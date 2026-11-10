import { INestApplication, ValidationPipe } from '@nestjs/common';
import { NestFactory } from '@nestjs/core';
import { NestExpressApplication } from '@nestjs/platform-express';
import connectPgSimple from 'connect-pg-simple';
import cookieParser from 'cookie-parser';
import { json, raw, type NextFunction, type Request, type Response } from 'express';
import session from 'express-session';
import helmet from 'helmet';
import { AppModule } from './app.module';
import { PrismaService } from './common/prisma.service';
import { requestContext } from './common/request-context.middleware';
import { logger } from './common/logger';
import { loadEnv } from './config/env';

export const WEBHOOK_BODY_LIMIT = '64kb';

/**
 * Builds the fully configured application. Shared by main.ts and the integration tests so tests exercise the
 * exact same middleware stack (raw-body capture, sessions, validation) as production.
 */
export async function createApp(): Promise<INestApplication> {
  const env = loadEnv();
  const app = await NestFactory.create<NestExpressApplication>(AppModule, { bodyParser: false, logger });
  app.setGlobalPrefix('api');
  if (env.trustProxy) app.set('trust proxy', 1);
  app.disable('x-powered-by');

  app.use(requestContext);
  app.use(helmet({ contentSecurityPolicy: false, crossOriginResourcePolicy: { policy: 'same-origin' } })); // API serves JSON only; CSP is set by Nginx for the SPA
  app.use((_: Request, res: Response, next: NextFunction) => { res.setHeader('Cache-Control', 'no-store'); next(); }); // never cache student / payment data

  // Raw body for the webhook ONLY: the HMAC must be computed over the exact bytes received.
  app.use('/api/webhooks/payment', raw({ type: () => true, limit: WEBHOOK_BODY_LIMIT }));
  app.use(json({ limit: '100kb' }));
  app.use(cookieParser());

  const prisma = app.get(PrismaService);
  const PgStore = connectPgSimple(session);
  app.use(
    session({
      store: new PgStore({ pool: prisma.pool, tableName: 'session', createTableIfMissing: false, pruneSessionInterval: 15 * 60 }),
      name: 'sid',
      secret: env.sessionSecret,
      resave: false,
      saveUninitialized: false,
      rolling: true, // idle timeout; the absolute lifetime is enforced in AuthGuard
      cookie: { httpOnly: true, secure: env.cookieSecure, sameSite: 'lax', maxAge: env.sessionIdleMinutes * 60_000, path: '/' },
    }),
  );

  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true, transform: true }));
  app.enableShutdownHooks();
  return app;
}
