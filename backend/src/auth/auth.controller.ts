import { Body, Controller, Get, HttpCode, Inject, Post, Req, Res } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import type { Request, Response } from 'express';
import { Auth, Public } from '../common/decorators';
import type { AuthContext } from '../common/auth.types';
import { ENV } from '../common/env.provider';
import type { Env } from '../config/env';
import { AuthService } from './auth.service';
import { LoginDto } from './auth.dto';

export const CSRF_COOKIE = 'XSRF-TOKEN';

const regenerate = (req: Request) => new Promise<void>((res, rej) => req.session.regenerate((e) => (e ? rej(e) : res())));
const save = (req: Request) => new Promise<void>((res, rej) => req.session.save((e) => (e ? rej(e) : res())));
const destroy = (req: Request) => new Promise<void>((res) => req.session.destroy(() => res()));

@Controller('auth')
export class AuthController {
  constructor(private readonly auth: AuthService, @Inject(ENV) private readonly env: Env) {}

  /** The CSRF token is readable by the SPA (non-HttpOnly cookie) and must be echoed in X-CSRF-Token on writes. */
  private csrfCookie(res: Response, token: string) {
    res.cookie(CSRF_COOKIE, token, { httpOnly: false, sameSite: 'lax', secure: this.env.cookieSecure, path: '/' });
  }

  @Public()
  @Post('login')
  @HttpCode(200)
  async login(@Body() dto: LoginDto, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    const session = await this.auth.authenticate(dto.email, dto.password, req.ip ?? 'unknown', req.id);
    await regenerate(req); // new session id on privilege change: prevents session fixation
    req.session.userId = session.user.id;
    req.session.createdAt = Date.now();
    req.session.csrf = randomBytes(32).toString('hex');
    await save(req);
    this.csrfCookie(res, req.session.csrf);
    return session;
  }

  /** Session restoration after a browser refresh. 401 when there is no valid session. */
  @Get('me')
  async me(@Auth() ctx: AuthContext, @Req() req: Request, @Res({ passthrough: true }) res: Response) {
    if (!req.session.csrf) { req.session.csrf = randomBytes(32).toString('hex'); await save(req); }
    this.csrfCookie(res, req.session.csrf);
    return this.auth.sessionFor(ctx.userId);
  }

  @Post('logout')
  @HttpCode(204)
  async logout(@Req() req: Request, @Res({ passthrough: true }) res: Response) {
    await destroy(req);
    res.clearCookie('sid', { path: '/' });
    res.clearCookie(CSRF_COOKIE, { path: '/' });
  }
}
