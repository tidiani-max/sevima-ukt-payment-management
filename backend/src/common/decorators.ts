import { createParamDecorator, ExecutionContext, SetMetadata } from '@nestjs/common';
import type { AuthContext, Role } from './auth.types';

export const IS_PUBLIC = 'isPublic';
export const SKIP_CSRF = 'skipCsrf';
export const ROLES = 'roles';

/** Opt a route OUT of authentication. Everything is authenticated by default (secure by default). */
export const Public = () => SetMetadata(IS_PUBLIC, true);
/** Opt out of CSRF (only for routes authenticated by something other than the session cookie, e.g. HMAC webhooks). */
export const SkipCsrf = () => SetMetadata(SKIP_CSRF, true);
export const Roles = (...roles: Role[]) => SetMetadata(ROLES, roles);

export const Auth = createParamDecorator((_: unknown, ctx: ExecutionContext): AuthContext => ctx.switchToHttp().getRequest().auth);
export const ReqId = createParamDecorator((_: unknown, ctx: ExecutionContext): string | undefined => ctx.switchToHttp().getRequest().id);
