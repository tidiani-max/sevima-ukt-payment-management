import { createCipheriv, createDecipheriv, randomBytes } from 'node:crypto';

/**
 * AES-256-GCM envelope for institution HMAC secrets at rest: "v1:<iv>:<tag>:<ciphertext>" (base64url parts).
 * The institution id is bound as additional authenticated data (AAD), so a ciphertext copied onto another
 * institution's row fails authentication instead of silently decrypting.
 */
export class SecretBox {
  constructor(private readonly key: Buffer) {
    if (key.length !== 32) throw new Error('SecretBox key must be 32 bytes');
  }

  encrypt(plaintext: string, aad: string): string {
    const iv = randomBytes(12);
    const cipher = createCipheriv('aes-256-gcm', this.key, iv);
    cipher.setAAD(Buffer.from(aad));
    const ct = Buffer.concat([cipher.update(plaintext, 'utf8'), cipher.final()]);
    return ['v1', iv.toString('base64url'), cipher.getAuthTag().toString('base64url'), ct.toString('base64url')].join(':');
  }

  decrypt(envelope: string, aad: string): string {
    const [v, iv, tag, ct] = envelope.split(':');
    if (v !== 'v1' || !iv || !tag || !ct) throw new Error('Unsupported secret envelope');
    const d = createDecipheriv('aes-256-gcm', this.key, Buffer.from(iv, 'base64url'));
    d.setAAD(Buffer.from(aad));
    d.setAuthTag(Buffer.from(tag, 'base64url'));
    return Buffer.concat([d.update(Buffer.from(ct, 'base64url')), d.final()]).toString('utf8');
  }
}
