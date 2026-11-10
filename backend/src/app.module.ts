import { Module } from '@nestjs/common';
import { APP_FILTER, APP_GUARD } from '@nestjs/core';
import { AuthModule } from './auth/auth.module';
import { EnvModule } from './common/env.provider';
import { AllExceptionsFilter } from './common/http-exception.filter';
import { AuthGuard, CsrfGuard, RolesGuard } from './common/guards';
import { PrismaService } from './common/prisma.service';
import { RateLimitService } from './common/rate-limit.service';
import { HealthController } from './health/health.controller';
import { InstitutionsModule } from './institutions/institutions.module';
import { InvoicesModule } from './invoices/invoices.module';
import { SemestersModule } from './semesters/semesters.module';
import { StudentsModule } from './students/students.module';
import { TransactionsModule } from './transactions/transactions.module';
import { WebhooksModule } from './webhooks/webhooks.module';
import { Global } from '@nestjs/common';

@Global()
@Module({ providers: [PrismaService, RateLimitService], exports: [PrismaService, RateLimitService] })
class CoreModule {}

@Module({
  imports: [EnvModule, CoreModule, AuthModule, InstitutionsModule, StudentsModule, SemestersModule, InvoicesModule, TransactionsModule, WebhooksModule],
  controllers: [HealthController],
  providers: [
    { provide: APP_FILTER, useClass: AllExceptionsFilter },
    // Order matters: authenticate -> authorise (role) -> CSRF.
    { provide: APP_GUARD, useClass: AuthGuard },
    { provide: APP_GUARD, useClass: RolesGuard },
    { provide: APP_GUARD, useClass: CsrfGuard },
  ],
})
export class AppModule {}
