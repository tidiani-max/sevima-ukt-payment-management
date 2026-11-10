import { createHmac, timingSafeEqual } from 'node:crypto';

export const SIGNATURE_HEADER = 'x-signature';
export const SIGNATURE_PREFIX = 'sha256=';

/** `sha256=<hex>` of HMAC-SHA256(secret, exactRawBodyBytes). */
export function sign(secret: string, rawBody: Buffer | string): string {
  return SIGNATURE_PREFIX + createHmac('sha256', secret).update(rawBody).digest('hex');
}

/**
 * Verifies the X-Signature header against the EXACT bytes received (never a re-serialised JSON object).
 * Strict header grammar, then constant-time comparison of equal-length digests.
 */
export function verifySignature(secret: string, rawBody: Buffer, header: string | undefined): boolean {
  if (!header) return false;
  const m = /^sha256=([0-9a-fA-F]{64})$/.exec(header.trim());
  if (!m) return false;
  const given = Buffer.from(m[1], 'hex');
  const expected = createHmac('sha256', secret).update(rawBody).digest();
  return given.length === expected.length && timingSafeEqual(given, expected);
}
