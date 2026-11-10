import { Global, Module } from '@nestjs/common';
import { loadEnv } from '../config/env';
import { SecretBox } from './secret-box';

export const ENV = Symbol('ENV');
export const SECRET_BOX = Symbol('SECRET_BOX');

@Global()
@Module({
  providers: [
    { provide: ENV, useFactory: () => loadEnv() },
    { provide: SECRET_BOX, useFactory: () => new SecretBox(loadEnv().secretsEncryptionKey) },
  ],
  exports: [ENV, SECRET_BOX],
})
export class EnvModule {}
