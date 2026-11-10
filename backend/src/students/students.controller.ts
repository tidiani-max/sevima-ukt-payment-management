import { Controller, Get, Query, Res } from '@nestjs/common';
import type { Response } from 'express';
import { Auth, Roles } from '../common/decorators';
import type { AuthContext } from '../common/auth.types';
import { parsePage, setTotal } from '../common/pagination';
import { StudentsService } from './students.service';

@Controller()
export class StudentsController {
  constructor(private readonly students: StudentsService) {}

  @Get('students')
  @Roles('ADMIN')
  async list(@Auth() auth: AuthContext, @Query() q: Record<string, unknown>, @Res({ passthrough: true }) res: Response) {
    const { rows, total } = await this.students.list(auth, parsePage(q));
    setTotal(res, total);
    return rows;
  }

  @Get('me/student')
  @Roles('STUDENT')
  me(@Auth() auth: AuthContext) { return this.students.me(auth); }
}
