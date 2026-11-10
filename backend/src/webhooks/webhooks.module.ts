import { Module } from '@nestjs/common';
import { AuditModule } from '../audit/audit.module';
import { loadEnv } from '../config/env';
import { MockGatewayController } from './mock-gateway.controller';
import { WebhooksController } from './webhooks.controller';
import { WebhooksService } from './webhooks.service';

@Module({
  imports: [AuditModule],
  // The mock gateway is registered only when explicitly enabled; in production it does not exist at all.
  controllers: [WebhooksController, ...(loadEnv().mockGatewayEnabled ? [MockGatewayController] : [])],
  providers: [WebhooksService],
  exports: [WebhooksService],
})
export class WebhooksModule {}
