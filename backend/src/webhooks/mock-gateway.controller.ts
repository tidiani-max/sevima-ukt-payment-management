import { Body, Controller, ForbiddenException, HttpCode, Post } from '@nestjs/common';
import { randomBytes } from 'node:crypto';
import { Auth, Roles } from '../common/decorators';
import type { AuthContext } from '../common/auth.types';
import { PrismaService } from '../common/prisma.service';
import { logger } from '../common/logger';
import { WebhooksService } from './webhooks.service';
import { sign } from './signature';

interface SimulationBody { payload?: Record<string, unknown>; tamperSignature?: boolean }

/**
 * MOCK PAYMENT GATEWAY (development / demo only; the controller is not even registered when MOCK_GATEWAY_ENABLED=false).
 * It behaves like a real gateway: serialises the payload ONCE, signs those exact bytes with the institution's real
 * server-side secret, and POSTs them to the real webhook endpoint over HTTP. The browser never sees any secret.
 */
@Controller('dev/webhooks')
export class MockGatewayController {
  constructor(private readonly webhooks: WebhooksService, private readonly prisma: PrismaService) {}

  @Post('simulate')
  @Roles('ADMIN')
  @HttpCode(200)
  async simulate(@Auth() auth: AuthContext, @Body() body: SimulationBody) {
    const payload = body?.payload;
    if (!payload || typeof payload !== 'object' || Array.isArray(payload)) {
      return { sent: false, message: 'Provide a "payload" object.' };
    }
    const code = typeof payload.institution_code === 'string' ? payload.institution_code : '';

    // A tenant admin may only simulate for their OWN institution (or an unregistered code, to test rejection).
    const own = await this.prisma.institution.findUnique({ where: { id: auth.institutionId }, select: { code: true } });
    const target = code ? await this.webhooks.secretFor(code) : null;
    if (target && code !== own?.code) throw new ForbiddenException('The simulator can only send events for your own institution.');
    const secret = target?.secret ?? randomBytes(32).toString('hex'); // unknown institution: nothing real to sign with

    const bytes = JSON.stringify(payload); // serialised exactly once; these bytes are what is signed AND sent
    let signature = sign(secret, bytes);
    if (body.tamperSignature === true) signature = signature.slice(0, -1) + (signature.endsWith('0') ? '1' : '0');

    try {
      const res = await fetch(this.webhooks.targetUrl, {
        method: 'POST',
        headers: { 'content-type': 'application/json', 'x-signature': signature, 'x-request-source': 'mock-gateway' },
        body: bytes,
        signal: AbortSignal.timeout(10_000),
      });
      const json = (await res.json().catch(() => ({}))) as { status?: string; message?: string };
      logger.event('info', 'mock_gateway_sent', { eventId: payload.event_id, institutionCode: code, httpStatus: res.status });
      return { sent: true, httpStatus: res.status, processingStatus: json.status, signature, message: json.message ?? res.statusText };
    } catch (e) {
      return { sent: false, message: `Could not reach the webhook endpoint: ${(e as Error).message}` };
    }
  }
}
