import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { startInfra, cleanDb, type TestInfra } from './setup.js';
import { getTestApp, closeTestApp } from '../helpers/app.js';
import type { FastifyInstance } from 'fastify';

let infra: TestInfra;
let app: FastifyInstance;

beforeAll(async () => {
  infra = await startInfra();
  app = await getTestApp();
}, 60_000);

afterAll(async () => {
  await closeTestApp();
  await infra.teardown();
});

beforeEach(async () => {
  await cleanDb(infra.prisma);
});

const PHONE = '+15551234567';
const DEVICE_ID = '00000000-0000-0000-0000-000000000001';

async function register(phone = PHONE, displayName = 'Alice') {
  return app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { phoneNumber: phone, displayName, otp: '123456', deviceId: DEVICE_ID },
  });
}

describe('POST /api/v1/auth/register', () => {
  it('creates user and returns token pair', async () => {
    const res = await register();

    expect(res.statusCode).toBe(201);
    const body = res.json<{ accessToken: string; refreshToken: string; expiresIn: number }>();
    expect(body.accessToken).toBeDefined();
    expect(body.refreshToken).toBeDefined();
    expect(body.expiresIn).toBe(900);
  });

  it('returns 409 for duplicate phone number', async () => {
    await register();
    const res = await register();

    expect(res.statusCode).toBe(409);
  });

  it('returns 400 for invalid phone format', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/register',
      payload: { phoneNumber: 'not-a-phone', displayName: 'Alice', otp: '123456', deviceId: DEVICE_ID },
    });

    expect(res.statusCode).toBe(400);
  });
});

describe('POST /api/v1/auth/login', () => {
  it('returns tokens for registered user', async () => {
    await register();

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { phoneNumber: PHONE, otp: '123456', deviceId: DEVICE_ID },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json<{ accessToken: string }>().accessToken).toBeDefined();
  });

  it('returns 401 for unregistered phone', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/login',
      payload: { phoneNumber: '+19999999999', otp: '123456', deviceId: DEVICE_ID },
    });

    expect(res.statusCode).toBe(401);
  });
});

describe('POST /api/v1/auth/refresh', () => {
  it('rotates refresh token and returns new pair', async () => {
    const reg = await register();
    const { refreshToken } = reg.json<{ refreshToken: string }>();

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken },
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ accessToken: string; refreshToken: string }>();
    expect(body.refreshToken).not.toBe(refreshToken);
  });

  it('returns 401 for unknown refresh token', async () => {
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: 'invalid-token' },
    });

    expect(res.statusCode).toBe(401);
  });

  it('rejects reuse of rotated token', async () => {
    const reg = await register();
    const { refreshToken: oldToken } = reg.json<{ refreshToken: string }>();

    // First refresh
    await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: oldToken },
    });

    // Attempt reuse
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken: oldToken },
    });

    expect(res.statusCode).toBe(401);
  });
});

describe('POST /api/v1/auth/logout', () => {
  it('invalidates session', async () => {
    const reg = await register();
    const { accessToken, refreshToken } = reg.json<{ accessToken: string; refreshToken: string }>();

    const logout = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/logout',
      headers: { Authorization: `Bearer ${accessToken}` },
      payload: { refreshToken },
    });

    expect(logout.statusCode).toBe(204);

    // Token should no longer be valid for refresh
    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/auth/refresh',
      payload: { refreshToken },
    });
    expect(res.statusCode).toBe(401);
  });
});
