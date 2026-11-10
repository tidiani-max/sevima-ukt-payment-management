import { Controller, Get, Module } from '@nestjs/common';
import { Auth } from '../common/decorators';
import type { AuthContext } from '../common/auth.types';
import { PrismaService } from '../common/prisma.service';

@Controller('semesters')
class SemestersController {
  constructor(private readonly prisma: PrismaService) {}

  /** Academic terms offered by the caller's institution. */
  @Get()
  async list(@Auth() auth: AuthContext) {
    const rows = await this.prisma.semester.findMany({ where: { institutionId: auth.institutionId }, orderBy: { value: 'desc' } });
    return rows.map((s) => ({ value: s.value, label: s.label, ...(s.current ? { current: true } : {}) }));
  }
}

@Module({ controllers: [SemestersController] })
export class SemestersModule {}
