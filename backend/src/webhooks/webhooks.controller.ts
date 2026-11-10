import { Controller, Get, HttpCode, Post, Query, Req, Res, UnsupportedMediaTypeException, BadRequestException, HttpException } from '@nestjs/common';
import type { Request, Response } from 'express';
import { Auth, Public, Roles, SkipCsrf } from '../common/decorators';
import type { AuthContext } from '../common/auth.types';
import { parsePage, setTotal } from '../common/pagination';
import { toWebhookEventDto } from '../common/mappers';
import { RateLimitService } from '../common/rate-limit.service';
import { WebhooksService } from './webhooks.service';

@Controller('webhooks')
export class WebhooksController {
  constructor(private readonly webhooks: WebhooksService, private readonly limiter: RateLimitService) {}

  /**
   * Payment gateway notification. Authenticated by HMAC (not by session), hence @Public + @SkipCsrf.
   * The raw body is captured by express.raw() in main.ts so the signature is checked over the exact bytes.
   */
  @Public()
  @SkipCsrf()
  @Post('payment')
  @HttpCode(200)
  async payment(@Req() req: Request, @Res() res: Response) {
    const ip = req.ip ?? 'unknown';
    const rl = await this.limiter.hit(`webhook:ip:${ip}`, 600, 60);
    if (!rl.allowed) {
      res.setHeader('Retry-After', String(rl.retryAfterSec));
      throw new HttpException('Too many webhook requests.', 429);
    }
    if (!Buffer.isBuffer(req.body)) throw new UnsupportedMediaTypeException('Send the notification as a raw application/json body.');
    if (req.body.length === 0) throw new BadRequestException('Empty request body.');

    const result = await this.webhooks.handle(req.body, req.header('x-signature'), { requestId: req.id, ip });
    res.status(result.httpStatus).json(result.body);
  }

  @Get('events')
  @Roles('ADMIN')
  async events(@Auth() auth: AuthContext, @Query() q: Record<string, string>, @Res({ passthrough: true }) res: Response) {
    const { rows, total } = await this.webhooks.listEvents(auth.institutionId, parsePage(q), q.status);
    setTotal(res, total);
    return rows.map(toWebhookEventDto);
  }
}
