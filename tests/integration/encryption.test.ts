import { describe, it, expect, beforeAll, afterAll, beforeEach, vi } from 'vitest';
import { startInfra, cleanDb, type TestInfra } from './setup.js';
import { getTestApp, closeTestApp, authHeader } from '../helpers/app.js';
import type { FastifyInstance } from 'fastify';

// Bypass signature verification for integration tests — we test storage + retrieval, not crypto
vi.mock('../../src/lib/signal.js', () => ({
  verifySignedPreKey: vi.fn().mockReturnValue(true),
  validateBase64Key: vi.fn(),
}));

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

const DEVICE = '00000000-0000-0000-0000-000000000001';

function makeBundle(preKeyCount = 5) {
  return {
    deviceId: DEVICE,
    identityKey: Buffer.alloc(33, 1).toString('base64'),
    signedPreKey: {
      keyId: 1,
      publicKey: Buffer.alloc(33, 2).toString('base64'),
      signature: Buffer.alloc(64, 3).toString('base64'),
    },
    preKeys: Array.from({ length: preKeyCount }, (_, i) => ({
      keyId: 100 + i,
      publicKey: Buffer.alloc(33, 4 + i).toString('base64'),
    })),
  };
}

async function registerAndUpload(phone: string) {
  const reg = await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { phoneNumber: phone, displayName: 'User', otp: '123456', deviceId: DEVICE } });
  const { accessToken } = reg.json<{ accessToken: string }>();

  await app.inject({
    method: 'POST',
    url: '/api/v1/encryption/keys',
    headers: authHeader(accessToken),
    payload: makeBundle(),
  });

  const me = (await app.inject({ method: 'GET', url: '/api/v1/users/me', headers: authHeader(accessToken) })).json<{ id: string }>();
  return { accessToken, userId: me.id };
}

describe('POST /api/v1/encryption/keys', () => {
  it('uploads PreKeyBundle successfully', async () => {
    const reg = await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { phoneNumber: '+15551000001', displayName: 'Alice', otp: '123456', deviceId: DEVICE } });
    const { accessToken } = reg.json<{ accessToken: string }>();

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/encryption/keys',
      headers: authHeader(accessToken),
      payload: makeBundle(10),
    });

    expect(res.statusCode).toBe(201);
  });
});

describe('GET /api/v1/encryption/keys/:userId', () => {
  it('returns bundle and consumes one pre-key', async () => {
    const alice = await registerAndUpload('+15551000001');
    const bob = await registerAndUpload('+15551000002');

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/encryption/keys/${alice.userId}`,
      headers: authHeader(bob.accessToken),
    });

    expect(res.statusCode).toBe(200);
    const bundle = res.json<{ identityKey: string; preKey: { keyId: number } | null }>();
    expect(bundle.identityKey).toBeDefined();
    expect(bundle.preKey).not.toBeNull();
    expect(bundle.preKey!.keyId).toBe(100); // first pre-key consumed
  });

  it('returns null preKey when all pre-keys exhausted', async () => {
    const alice = await registerAndUpload('+15551000001');
    const bob = await registerAndUpload('+15551000002');

    // Exhaust all 5 pre-keys
    for (let i = 0; i < 5; i++) {
      await app.inject({ method: 'GET', url: `/api/v1/encryption/keys/${alice.userId}`, headers: authHeader(bob.accessToken) });
    }

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/encryption/keys/${alice.userId}`,
      headers: authHeader(bob.accessToken),
    });

    expect(res.json<{ preKey: null }>().preKey).toBeNull();
  });

  it('returns 404 for user without bundle', async () => {
    const alice = await registerAndUpload('+15551000001');
    const bob = (await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { phoneNumber: '+15551000002', displayName: 'Bob', otp: '123456', deviceId: DEVICE } })).json<{ accessToken: string }>();
    const bobId = (await app.inject({ method: 'GET', url: '/api/v1/users/me', headers: authHeader(bob.accessToken) })).json<{ id: string }>().id;

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/encryption/keys/${bobId}`,
      headers: authHeader(alice.accessToken),
    });

    expect(res.statusCode).toBe(404);
  });
});

describe('POST /api/v1/encryption/keys/replenish', () => {
  it('adds new pre-keys', async () => {
    const alice = await registerAndUpload('+15551000001');

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/encryption/keys/replenish',
      headers: authHeader(alice.accessToken),
      payload: {
        preKeys: [
          { keyId: 200, publicKey: Buffer.alloc(33, 9).toString('base64') },
        ],
      },
    });

    expect(res.statusCode).toBe(200);

    const count = await app.inject({ method: 'GET', url: '/api/v1/encryption/keys/count', headers: authHeader(alice.accessToken) });
    expect(count.json<{ count: number }>().count).toBe(6); // 5 original + 1 new
  });
});
