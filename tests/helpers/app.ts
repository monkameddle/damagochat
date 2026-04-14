import { buildApp } from '../../src/app.js';
import type { FastifyInstance } from 'fastify';

let _app: FastifyInstance | null = null;

export async function getTestApp(): Promise<FastifyInstance> {
  if (!_app) {
    // Minimal env for app bootstrap
    process.env['JWT_ACCESS_SECRET'] = 'a'.repeat(64);
    process.env['JWT_REFRESH_SECRET'] = 'b'.repeat(64);
    process.env['S3_ENDPOINT'] = 'http://localhost:9000';
    process.env['S3_BUCKET'] = 'test-bucket';
    process.env['S3_ACCESS_KEY'] = 'test';
    process.env['S3_SECRET_KEY'] = 'test';
    process.env['MEILISEARCH_URL'] = 'http://localhost:7700';
    process.env['MEILISEARCH_KEY'] = 'test';
    process.env['OTP_STUB'] = 'true';

    _app = await buildApp();
  }
  return _app;
}

export async function closeTestApp(): Promise<void> {
  await _app?.close();
  _app = null;
}

export function authHeader(token: string): { Authorization: string } {
  return { Authorization: `Bearer ${token}` };
}
