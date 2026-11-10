// Loaded by Jest before every test file. Uses a dedicated test database; secrets here are throwaway test values.
process.env.NODE_ENV = 'test';
process.env.APP_ENV = 'test';
process.env.DATABASE_URL = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL ?? 'postgresql://ukt:ukt_dev_only@127.0.0.1:5432/ukt_test';
process.env.SESSION_SECRET = 'test-session-secret-test-session-secret-0123456789';
process.env.SECRETS_ENCRYPTION_KEY = Buffer.alloc(32, 7).toString('base64');
process.env.MOCK_GATEWAY_ENABLED = 'true';
process.env.PORT = '3999';
process.env.COOKIE_SECURE = 'false';
process.env.LOG_LEVEL = 'error';
