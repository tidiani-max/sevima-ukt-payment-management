import { ForbiddenException, Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../common/prisma.service';
import type { AuthContext } from '../common/auth.types';
import type { Page } from '../common/pagination';

const select = { id: true, institutionId: true, nim: true, name: true, program: true, faculty: true } as const;

@Injectable()
export class StudentsService {
  constructor(private readonly prisma: PrismaService) {}

  async list(auth: AuthContext, page: Page) {
    const where = { institutionId: auth.institutionId };
    const [rows, total] = await Promise.all([
      this.prisma.student.findMany({ where, select, orderBy: [{ name: 'asc' }, { id: 'asc' }], take: page.limit, skip: page.offset }),
      this.prisma.student.count({ where }),
    ]);
    return { rows, total };
  }

  async me(auth: AuthContext) {
    if (!auth.studentId) throw new ForbiddenException('This account is not linked to a student.');
    const s = await this.prisma.student.findFirst({ where: { id: auth.studentId, institutionId: auth.institutionId }, select });
    if (!s) throw new NotFoundException('Student not found.');
    return s;
  }
}
