import { BadRequestException, ConflictException, ForbiddenException, Injectable, NotFoundException, UnprocessableEntityException } from '@nestjs/common';
import { PaymentStatus, Prisma } from '@prisma/client';
import { PrismaService } from '../common/prisma.service';
import type { AuthContext } from '../common/auth.types';
import type { Page } from '../common/pagination';
import { toInvoiceDto } from '../common/mappers';
import { uniqueViolation } from '../common/db-errors';
import { logger } from '../common/logger';
import { CreateInvoiceDto } from './invoices.dto';

const include = { semester: { select: { value: true } } } as const;

/** Today's calendar date in Asia/Jakarta (UKT is billed by Indonesian calendar day). */
export const jakartaToday = (now = new Date()) => new Date(now.getTime() + 7 * 3_600_000).toISOString().slice(0, 10);

export function isRealDate(s: string): boolean {
  const d = new Date(`${s}T00:00:00.000Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === s;
}

@Injectable()
export class InvoicesService {
  constructor(private readonly prisma: PrismaService) {}

  async list(auth: AuthContext, page: Page, filter: { status?: string; q?: string }) {
    if (filter.status && !(filter.status in PaymentStatus)) throw new BadRequestException('status must be UNPAID, PAID or EXPIRED.');
    const where: Prisma.InvoiceWhereInput = {
      institutionId: auth.institutionId, // tenant scope: always from the session
      ...(filter.status ? { status: filter.status as PaymentStatus } : {}),
      ...(filter.q ? { invoiceNumber: { contains: filter.q.slice(0, 64), mode: 'insensitive' } } : {}),
    };
    return this.page(where, page);
  }

  async listMine(auth: AuthContext, page: Page) {
    if (!auth.studentId) throw new ForbiddenException('This account is not linked to a student.');
    return this.page({ institutionId: auth.institutionId, studentId: auth.studentId }, page);
  }

  private async page(where: Prisma.InvoiceWhereInput, page: Page) {
    const [rows, total] = await Promise.all([
      this.prisma.invoice.findMany({ where, include, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }], take: page.limit, skip: page.offset }),
      this.prisma.invoice.count({ where }),
    ]);
    return { rows: rows.map(toInvoiceDto), total };
  }

  /** Admins: any invoice of their institution. Students: only their own. Everything else is a 404 (no existence leak). */
  async get(auth: AuthContext, id: string) {
    const where: Prisma.InvoiceWhereInput = {
      id,
      institutionId: auth.institutionId,
      ...(auth.role === 'STUDENT' ? { studentId: auth.studentId ?? '00000000-0000-0000-0000-000000000000' } : {}),
    };
    const inv = await this.prisma.invoice.findFirst({ where, include });
    if (!inv) throw new NotFoundException('Invoice not found.');
    return toInvoiceDto(inv);
  }

  async create(auth: AuthContext, dto: CreateInvoiceDto) {
    if (!isRealDate(dto.issuedAt)) throw new UnprocessableEntityException('issuedAt is not a valid calendar date.');
    if (!isRealDate(dto.expiresAt)) throw new UnprocessableEntityException('expiresAt is not a valid calendar date.');
    if (dto.expiresAt < dto.issuedAt) throw new UnprocessableEntityException('The expiration date cannot be before the issue date.');
    if (dto.expiresAt < jakartaToday()) throw new UnprocessableEntityException('The expiration date cannot be in the past.');

    // Ownership checks use the caller's institution, so a foreign studentId/semester is indistinguishable from a missing one.
    const [student, semester] = await Promise.all([
      this.prisma.student.findFirst({ where: { id: dto.studentId, institutionId: auth.institutionId }, select: { id: true } }),
      this.prisma.semester.findFirst({ where: { value: dto.semester, institutionId: auth.institutionId }, select: { id: true } }),
    ]);
    if (!student) throw new NotFoundException('Student not found at your institution.');
    if (!semester) throw new UnprocessableEntityException('Unknown semester for your institution.');

    try {
      const inv = await this.prisma.invoice.create({
        data: {
          institutionId: auth.institutionId,
          studentId: student.id,
          semesterId: semester.id,
          invoiceNumber: dto.invoiceNumber,
          amount: BigInt(dto.amount),
          status: 'UNPAID',
          issuedAt: new Date(`${dto.issuedAt}T00:00:00.000Z`),
          expiresAt: new Date(`${dto.expiresAt}T00:00:00.000Z`),
        },
        include,
      });
      logger.event('info', 'invoice_created', { userId: auth.userId, invoiceId: inv.id });
      return toInvoiceDto(inv);
    } catch (e) {
      const u = uniqueViolation(e);
      if (u) {
        if (/one_active_per_student_semester|semesterId/.test(u)) throw new ConflictException('This student already has an active invoice for that semester.');
        throw new ConflictException('This invoice number is already used at your institution.');
      }
      throw e;
    }
  }
}
