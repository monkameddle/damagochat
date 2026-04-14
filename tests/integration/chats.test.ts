import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { startInfra, cleanDb, type TestInfra } from './setup.js';
import { getTestApp, closeTestApp, authHeader } from '../helpers/app.js';
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

const DEVICE = '00000000-0000-0000-0000-000000000001';

async function registerUser(phone: string, name: string) {
  const res = await app.inject({
    method: 'POST',
    url: '/api/v1/auth/register',
    payload: { phoneNumber: phone, displayName: name, otp: '123456', deviceId: DEVICE },
  });
  return res.json<{ accessToken: string; userId?: string }>();
}

describe('POST /api/v1/chats', () => {
  it('creates a direct chat between two users', async () => {
    const alice = await registerUser('+15551000001', 'Alice');
    const bob = await registerUser('+15551000002', 'Bob');

    // Get Bob's userId from /me
    const bobMe = await app.inject({
      method: 'GET',
      url: '/api/v1/users/me',
      headers: authHeader(bob.accessToken),
    });
    const bobId = bobMe.json<{ id: string }>().id;

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/chats',
      headers: authHeader(alice.accessToken),
      payload: { type: 'DIRECT', userId: bobId },
    });

    expect(res.statusCode).toBe(201);
    const chat = res.json<{ id: string; type: string; members: unknown[] }>();
    expect(chat.type).toBe('DIRECT');
    expect(chat.members).toHaveLength(2);
  });

  it('is idempotent — returns same direct chat on second call', async () => {
    const alice = await registerUser('+15551000001', 'Alice');
    const bob = await registerUser('+15551000002', 'Bob');
    const bobId = (await app.inject({ method: 'GET', url: '/api/v1/users/me', headers: authHeader(bob.accessToken) })).json<{ id: string }>().id;

    const res1 = await app.inject({ method: 'POST', url: '/api/v1/chats', headers: authHeader(alice.accessToken), payload: { type: 'DIRECT', userId: bobId } });
    const res2 = await app.inject({ method: 'POST', url: '/api/v1/chats', headers: authHeader(alice.accessToken), payload: { type: 'DIRECT', userId: bobId } });

    expect(res1.json<{ id: string }>().id).toBe(res2.json<{ id: string }>().id);
  });

  it('creates a group chat', async () => {
    const alice = await registerUser('+15551000001', 'Alice');
    const bob = await registerUser('+15551000002', 'Bob');
    const bobId = (await app.inject({ method: 'GET', url: '/api/v1/users/me', headers: authHeader(bob.accessToken) })).json<{ id: string }>().id;

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/chats',
      headers: authHeader(alice.accessToken),
      payload: { type: 'GROUP', name: 'Dev Team', memberIds: [bobId] },
    });

    expect(res.statusCode).toBe(201);
    const chat = res.json<{ type: string; name: string }>();
    expect(chat.type).toBe('GROUP');
    expect(chat.name).toBe('Dev Team');
  });

  it('returns 400 when creating a direct chat with self', async () => {
    const alice = await registerUser('+15551000001', 'Alice');
    const aliceId = (await app.inject({ method: 'GET', url: '/api/v1/users/me', headers: authHeader(alice.accessToken) })).json<{ id: string }>().id;

    const res = await app.inject({
      method: 'POST',
      url: '/api/v1/chats',
      headers: authHeader(alice.accessToken),
      payload: { type: 'DIRECT', userId: aliceId },
    });

    expect(res.statusCode).toBe(400);
  });
});

describe('PATCH /api/v1/chats/:chatId', () => {
  it('allows admin to rename group', async () => {
    const alice = await registerUser('+15551000001', 'Alice');
    const bob = await registerUser('+15551000002', 'Bob');
    const bobId = (await app.inject({ method: 'GET', url: '/api/v1/users/me', headers: authHeader(bob.accessToken) })).json<{ id: string }>().id;

    const chat = (await app.inject({ method: 'POST', url: '/api/v1/chats', headers: authHeader(alice.accessToken), payload: { type: 'GROUP', name: 'Old Name', memberIds: [bobId] } })).json<{ id: string }>();

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/chats/${chat.id}`,
      headers: authHeader(alice.accessToken),
      payload: { name: 'New Name' },
    });

    expect(res.statusCode).toBe(200);
    expect(res.json<{ name: string }>().name).toBe('New Name');
  });

  it('returns 403 for non-admin member', async () => {
    const alice = await registerUser('+15551000001', 'Alice');
    const bob = await registerUser('+15551000002', 'Bob');
    const bobId = (await app.inject({ method: 'GET', url: '/api/v1/users/me', headers: authHeader(bob.accessToken) })).json<{ id: string }>().id;

    const chat = (await app.inject({ method: 'POST', url: '/api/v1/chats', headers: authHeader(alice.accessToken), payload: { type: 'GROUP', name: 'Name', memberIds: [bobId] } })).json<{ id: string }>();

    const res = await app.inject({
      method: 'PATCH',
      url: `/api/v1/chats/${chat.id}`,
      headers: authHeader(bob.accessToken),
      payload: { name: 'Hacked' },
    });

    expect(res.statusCode).toBe(403);
  });
});

describe('DELETE /api/v1/chats/:chatId/leave', () => {
  it('removes member from chat', async () => {
    const alice = await registerUser('+15551000001', 'Alice');
    const bob = await registerUser('+15551000002', 'Bob');
    const bobId = (await app.inject({ method: 'GET', url: '/api/v1/users/me', headers: authHeader(bob.accessToken) })).json<{ id: string }>().id;

    const chat = (await app.inject({ method: 'POST', url: '/api/v1/chats', headers: authHeader(alice.accessToken), payload: { type: 'GROUP', name: 'Room', memberIds: [bobId] } })).json<{ id: string }>();

    const res = await app.inject({
      method: 'DELETE',
      url: `/api/v1/chats/${chat.id}/leave`,
      headers: authHeader(bob.accessToken),
    });

    expect(res.statusCode).toBe(204);

    // Bob can no longer access chat
    const check = await app.inject({
      method: 'GET',
      url: `/api/v1/chats/${chat.id}`,
      headers: authHeader(bob.accessToken),
    });
    expect(check.statusCode).toBe(403);
  });
});
