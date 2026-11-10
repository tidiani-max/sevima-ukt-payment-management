import { CanActivate, ExecutionContext, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { timingSafeEqual } from 'node:crypto';
import type { Request } from 'express';
import { Inject } from '@nestjs/common';
import { ENV } from './env.provider';
import type { Env } from '../config/env';
import { IS_PUBLIC, ROLES, SKIP_CSRF } from './decorators';
import { PrismaService } from './prisma.service';
import type { Role } from './auth.types';

/**
 * Authentication: resolves the server-side session into an AuthContext. The user row is re-read on every request,
 * so a deleted user or changed role takes effect immediately; the institution comes from that row, never from input.
 */
@Injectable()
export class AuthGuard implements CanActivate {
  constructor(private readonly reflector: Reflector, private readonly prisma: PrismaService, @Inject(ENV) private readonly env: Env) {}

  async canActivate(ctx: ExecutionContext): Promise<boolean> {
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()])) return true;
    const req = ctx.switchToHttp().getRequest<Request>();
    const userId = req.session?.userId;
    if (!userId) throw new UnauthorizedException('Authentication required.');

    const absoluteMs = this.env.sessionAbsoluteHours * 3_600_000;
    if (req.session.createdAt && Date.now() - req.session.createdAt > absoluteMs) {
      await new Promise<void>((r) => req.session.destroy(() => r()));
      throw new UnauthorizedException('Your session has expired. Please sign in again.');
    }

    const user = await this.prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true, institutionId: true, studentId: true } });
    if (!user) {
      await new Promise<void>((r) => req.session.destroy(() => r()));
      throw new UnauthorizedException('Authentication required.');
    }
    req.auth = { userId: user.id, role: user.role, institutionId: user.institutionId, studentId: user.studentId };
    return true;
  }
}

/** Role-based access control. Runs after AuthGuard. */
@Injectable()
export class RolesGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(ctx: ExecutionContext): boolean {
    const roles = this.reflector.getAllAndOverride<Role[]>(ROLES, [ctx.getHandler(), ctx.getClass()]);
    if (!roles?.length) return true;
    const req = ctx.switchToHttp().getRequest<Request>();
    if (!req.auth || !roles.includes(req.auth.role)) throw new ForbiddenException('You do not have permission to perform this action.');
    return true;
  }
}

const SAFE = new Set(['GET', 'HEAD', 'OPTIONS']);

/** Synchroniser-token CSRF protection: header X-CSRF-Token must equal the token stored in the server-side session. */
@Injectable()
export class CsrfGuard implements CanActivate {
  constructor(private readonly reflector: Reflector) {}
  canActivate(ctx: ExecutionContext): boolean {
    if (SAFE.has(ctx.switchToHttp().getRequest<Request>().method)) return true;
    if (this.reflector.getAllAndOverride<boolean>(SKIP_CSRF, [ctx.getHandler(), ctx.getClass()])) return true;
    if (this.reflector.getAllAndOverride<boolean>(IS_PUBLIC, [ctx.getHandler(), ctx.getClass()])) return true;
    const req = ctx.switchToHttp().getRequest<Request>();
    const expected = req.session?.csrf;
    const given = req.header('x-csrf-token');
    if (!expected || !given) throw new ForbiddenException('Missing CSRF token.');
    const a = Buffer.from(expected);
    const b = Buffer.from(given);
    if (a.length !== b.length || !timingSafeEqual(a, b)) throw new ForbiddenException('Invalid CSRF token.');
    return true;
  }
}
