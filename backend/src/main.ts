import 'reflect-metadata';
import { createApp } from './app.factory';
import { loadEnv } from './config/env';
import { logger } from './common/logger';

async function bootstrap() {
  const env = loadEnv(); // fail fast on bad configuration
  const app = await createApp();
  await app.listen(env.port, '0.0.0.0');
  logger.event('info', 'server_started', { port: env.port, appEnv: env.appEnv, mockGateway: env.mockGatewayEnabled });
}

bootstrap().catch((e) => {
  logger.event('error', 'bootstrap_failed', { error: (e as Error).message });
  process.exit(1);
});
