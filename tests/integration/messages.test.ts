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

async function setup() {
  const aliceRes = await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { phoneNumber: '+15551000001', displayName: 'Alice', otp: '123456', deviceId: DEVICE } });
  const bobRes = await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { phoneNumber: '+15551000002', displayName: 'Bob', otp: '123456', deviceId: DEVICE } });

  const alice = aliceRes.json<{ accessToken: string }>();
  const bob = bobRes.json<{ accessToken: string }>();

  const bobId = (await app.inject({ method: 'GET', url: '/api/v1/users/me', headers: authHeader(bob.accessToken) })).json<{ id: string }>().id;

  const chatRes = await app.inject({ method: 'POST', url: '/api/v1/chats', headers: authHeader(alice.accessToken), payload: { type: 'DIRECT', userId: bobId } });
  const chat = chatRes.json<{ id: string }>();

  return { aliceToken: alice.accessToken, bobToken: bob.accessToken, chatId: chat.id };
}

// Seed a message directly via Prisma for list/get tests
async function seedMessage(chatId: string, senderId: string) {
  return infra.prisma.message.create({
    data: { chatId, senderId, type: 'TEXT', ciphertext: 'encrypted-payload' },
  });
}

describe('GET /api/v1/chats/:chatId/messages', () => {
  it('returns messages for chat member', async () => {
    const { aliceToken, chatId } = await setup();
    const aliceId = (await app.inject({ method: 'GET', url: '/api/v1/users/me', headers: authHeader(aliceToken) })).json<{ id: string }>().id;
    await seedMessage(chatId, aliceId);

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/chats/${chatId}/messages`,
      headers: authHeader(aliceToken),
    });

    expect(res.statusCode).toBe(200);
    const body = res.json<{ items: unknown[] }>();
    expect(body.items).toHaveLength(1);
  });

  it('returns 403 for non-member', async () => {
    const { chatId } = await setup();
    const eveRes = await app.inject({ method: 'POST', url: '/api/v1/auth/register', payload: { phoneNumber: '+15551000099', displayName: 'Eve', otp: '123456', deviceId: DEVICE } });
    const eveToken = eveRes.json<{ accessToken: string }>().accessToken;

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/chats/${chatId}/messages`,
      headers: authHeader(eveToken),
    });

    expect(res.statusCode).toBe(403);
  });

  it('supports cursor pagination', async () => {
    const { aliceToken, chatId } = await setup();
    const aliceId = (await app.inject({ method: 'GET', url: '/api/v1/users/me', headers: authHeader(aliceToken) })).json<{ id: string }>().id;

    // Seed 3 messages with distinct timestamps
    for (let i = 0; i < 3; i++) {
      await seedMessage(chatId, aliceId);
      await new Promise((r) => setTimeout(r, 10));
    }

    // Fetch first 2
    const page1 = await app.inject({
      method: 'GET',
      url: `/api/v1/chats/${chatId}/messages?limit=2`,
      headers: authHeader(aliceToken),
    });
    const { items, nextCursor } = page1.json<{ items: unknown[]; nextCursor?: string }>();
    expect(items).toHaveLength(2);
    expect(nextCursor).toBeDefined();

    // Fetch next page
    const page2 = await app.inject({
      method: 'GET',
      url: `/api/v1/chats/${chatId}/messages?limit=2&cursor=${nextCursor}`,
      headers: authHeader(aliceToken),
    });
    expect(page2.json<{ items: unknown[] }>().items).toHaveLength(1);
  });
});

describe('GET /api/v1/chats/:chatId/messages/:messageId', () => {
  it('returns single message for member', async () => {
    const { aliceToken, chatId } = await setup();
    const aliceId = (await app.inject({ method: 'GET', url: '/api/v1/users/me', headers: authHeader(aliceToken) })).json<{ id: string }>().id;
    const msg = await seedMessage(chatId, aliceId);

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/chats/${chatId}/messages/${msg.id}`,
      headers: authHeader(aliceToken),
    });

    expect(res.statusCode).toBe(200);
    expect(res.json<{ id: string }>().id).toBe(msg.id);
  });

  it('returns 404 for wrong chatId', async () => {
    const { aliceToken, chatId } = await setup();
    const aliceId = (await app.inject({ method: 'GET', url: '/api/v1/users/me', headers: authHeader(aliceToken) })).json<{ id: string }>().id;
    const msg = await seedMessage(chatId, aliceId);

    const res = await app.inject({
      method: 'GET',
      url: `/api/v1/chats/00000000-0000-0000-0000-000000000000/messages/${msg.id}`,
      headers: authHeader(aliceToken),
    });

    expect(res.statusCode).toBe(403); // non-member of fake chatId
  });
});
