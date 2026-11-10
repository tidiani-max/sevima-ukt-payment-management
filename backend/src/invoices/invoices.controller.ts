import { Body, Controller, Get, HttpCode, Param, ParseUUIDPipe, Post, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Auth, Roles } from '../common/decorators';
import type { AuthContext } from '../common/auth.types';
import { parsePage, setTotal } from '../common/pagination';
import { CreateInvoiceDto } from './invoices.dto';
import { InvoicesService } from './invoices.service';

@Controller()
export class InvoicesController {
  constructor(private readonly invoices: InvoicesService) {}

  @Post('invoices')
  @Roles('ADMIN')
  @HttpCode(201)
  create(@Auth() auth: AuthContext, @Body() dto: CreateInvoiceDto) { return this.invoices.create(auth, dto); }

  @Get('invoices')
  @Roles('ADMIN')
  async list(@Auth() auth: AuthContext, @Query() q: Record<string, string>, @Res({ passthrough: true }) res: Response) {
    const { rows, total } = await this.invoices.list(auth, parsePage(q), { status: q.status, q: q.q });
    setTotal(res, total);
    return rows;
  }

  @Get('invoices/:id')
  get(@Auth() auth: AuthContext, @Param('id', new ParseUUIDPipe()) id: string) { return this.invoices.get(auth, id); }

  @Get('me/invoices')
  @Roles('STUDENT')
  async mine(@Auth() auth: AuthContext, @Query() q: Record<string, string>, @Res({ passthrough: true }) res: Response) {
    const { rows, total } = await this.invoices.listMine(auth, parsePage(q));
    setTotal(res, total);
    return rows;
  }
}
