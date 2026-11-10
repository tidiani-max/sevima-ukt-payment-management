import { Controller, Get, Module } from '@nestjs/common';
import { Auth } from '../common/decorators';
import type { AuthContext } from '../common/auth.types';
import { PrismaService } from '../common/prisma.service';

@Controller('institutions')
class InstitutionsController {
  constructor(private readonly prisma: PrismaService) {}

  /**
   * Returns ONLY the caller's own institution. There is deliberately no platform-wide institution directory:
   * listing other tenants would leak their existence and codes. The HMAC secret is never selected.
   */
  @Get()
  async list(@Auth() auth: AuthContext) {
    return this.prisma.institution.findMany({ where: { id: auth.institutionId }, select: { id: true, code: true, name: true } });
  }
}

@Module({ controllers: [InstitutionsController] })
export class InstitutionsModule {}
