import { Controller, Get, Inject, ServiceUnavailableException } from '@nestjs/common';
import { Public } from '../common/decorators';
import { ENV } from '../common/env.provider';
import type { Env } from '../config/env';
import { PrismaService } from '../common/prisma.service';

@Controller()
export class HealthController {
  constructor(private readonly prisma: PrismaService, @Inject(ENV) private readonly env: Env) {}

  /** Liveness: the process is up. No dependencies touched. */
  @Public() @Get('health')
  health() { return { status: 'ok' }; }

  /** Readiness: the database answers. Used by the container health check. */
  @Public() @Get('ready')
  async ready() {
    try {
      await this.prisma.$queryRaw`SELECT 1`;
      return { status: 'ready' };
    } catch {
      throw new ServiceUnavailableException('Database is not reachable.');
    }
  }

  /** Non-sensitive runtime flags the SPA needs (e.g. whether to show the Gateway Simulator). */
  @Public() @Get('config')
  config() { return { mockGatewayEnabled: this.env.mockGatewayEnabled, environment: this.env.appEnv }; }
}
