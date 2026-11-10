import { HttpException, HttpStatus, Injectable, OnModuleInit, UnauthorizedException } from '@nestjs/common';
import * as argon2 from 'argon2';
import { PrismaService } from '../common/prisma.service';
import { RateLimitService } from '../common/rate-limit.service';
import { logger } from '../common/logger';

export interface SessionDto {
  user: { id: string; name: string; email: string; role: 'ADMIN' | 'STUDENT'; institutionId: string; studentId?: string };
  institution: { id: string; code: string; name: string };
}

const ARGON_OPTS: argon2.Options = { type: argon2.argon2id, memoryCost: 19_456, timeCost: 2, parallelism: 1 }; // OWASP minimum profile
const WINDOW_SEC = 15 * 60;

@Injectable()
export class AuthService implements OnModuleInit {
  private dummyHash = '';

  constructor(private readonly prisma: PrismaService, private readonly limiter: RateLimitService) {}

  async onModuleInit() {
    // Verified against when the email is unknown, so response time does not reveal which emails exist.
    this.dummyHash = await argon2.hash('not-a-real-password', ARGON_OPTS);
  }

  hashPassword(plain: string) { return argon2.hash(plain, ARGON_OPTS); }

  async authenticate(emailRaw: string, password: string, ip: string, requestId?: string): Promise<SessionDto> {
    const email = emailRaw.trim().toLowerCase();
    const [byIp, byEmail] = await Promise.all([
      this.limiter.hit(`login:ip:${ip}`, 50, WINDOW_SEC),
      this.limiter.hit(`login:email:${email}`, 8, WINDOW_SEC),
    ]);
    if (!byIp.allowed || !byEmail.allowed) {
      const retry = Math.max(byIp.allowed ? 0 : byIp.retryAfterSec, byEmail.allowed ? 0 : byEmail.retryAfterSec);
      logger.event('warn', 'login_rate_limited', { requestId, ip });
      throw new HttpException({ message: 'Too many sign-in attempts. Please wait a few minutes and try again.', retryAfterSec: retry }, HttpStatus.TOO_MANY_REQUESTS);
    }

    const user = await this.prisma.user.findUnique({ where: { email }, include: { institution: { select: { id: true, code: true, name: true } } } });
    const ok = await argon2.verify(user?.passwordHash ?? this.dummyHash, password).catch(() => false);
    if (!user || !ok) {
      logger.event('warn', 'login_failed', { requestId, ip });
      throw new UnauthorizedException('Incorrect email or password.');
    }
    await this.limiter.reset(`login:email:${email}`);
    return this.toSession(user, user.institution);
  }

  async sessionFor(userId: string): Promise<SessionDto> {
    const user = await this.prisma.user.findUnique({ where: { id: userId }, include: { institution: { select: { id: true, code: true, name: true } } } });
    if (!user) throw new UnauthorizedException('Authentication required.');
    return this.toSession(user, user.institution);
  }

  private toSession(
    u: { id: string; name: string; email: string; role: 'ADMIN' | 'STUDENT'; institutionId: string; studentId: string | null },
    institution: { id: string; code: string; name: string },
  ): SessionDto {
    return {
      user: { id: u.id, name: u.name, email: u.email, role: u.role, institutionId: u.institutionId, ...(u.studentId ? { studentId: u.studentId } : {}) },
      institution,
    };
  }
}
