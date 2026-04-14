/**
 * E2E: two WebSocket clients exchange an encrypted message end-to-end.
 * Tests: connect, message.send, message.new fan-out, receipt.read, receipt.update.
 */
import { describe, it, expect, beforeAll, afterAll, beforeEach } from 'vitest';
import { WebSocket } from 'ws';
import { startInfra, cleanDb, type TestInfra } from '../integration/setup.js';
import { getTestApp, closeTestApp, authHeader } from '../helpers/app.js';
import type { FastifyInstance } from 'fastify';
import type { AddressInfo } from 'net';

let infra: TestInfra;
let app: FastifyInstance;
let baseUrl: string;
let wsUrl: string;

beforeAll(async () => {
  infra = await startInfra();
  app = await getTestApp();
  await app.listen({ port: 0, host: '127.0.0.1' });
  const port = (app.server.address() as AddressInfo).port;
  baseUrl = `http://127.0.0.1:${port}`;
  wsUrl = `ws://127.0.0.1:${port}`;
}, 60_000);

afterAll(async () => {
  await closeTestApp();
  await infra.teardown();
});

beforeEach(async () => {
  await cleanDb(infra.prisma);
});

const DEVICE = '00000000-0000-0000-0000-000000000001';

async function register(phone: string, name: string) {
  const res = await fetch(`${baseUrl}/api/v1/auth/register`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ phoneNumber: phone, displayName: name, otp: '123456', deviceId: DEVICE }),
  });
  return res.json() as Promise<{ accessToken: string }>;
}

async function getMe(token: string): Promise<{ id: string }> {
  const res = await fetch(`${baseUrl}/api/v1/users/me`, { headers: { Authorization: `Bearer ${token}` } });
  return res.json() as Promise<{ id: string }>;
}

async function createChat(token: string, userId: string): Promise<{ id: string }> {
  const res = await fetch(`${baseUrl}/api/v1/chats`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
    body: JSON.stringify({ type: 'DIRECT', userId }),
  });
  return res.json() as Promise<{ id: string }>;
}

function connectWs(token: string): WebSocket {
  return new WebSocket(`${wsUrl}/ws?token=${token}`);
}

function waitForMessage(ws: WebSocket, type: string, timeoutMs = 5000): Promise<Record<string, unknown>> {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error(`Timeout waiting for ${type}`)), timeoutMs);
    ws.on('message', (raw) => {
      const msg = JSON.parse(raw.toString()) as { type: string };
      if (msg.type === type) {
        clearTimeout(timer);
        resolve(msg as Record<string, unknown>);
      }
    });
  });
}

function wsOpen(ws: WebSocket): Promise<void> {
  return new Promise((resolve, reject) => {
    ws.once('open', resolve);
    ws.once('error', reject);
  });
}

describe('WebSocket messaging E2E', () => {
  it('Alice sends a message and Bob receives it', async () => {
    const alice = await register('+15551000001', 'Alice');
    const bob = await register('+15551000002', 'Bob');

    const bobId = (await getMe(bob.accessToken)).id;
    const chat = await createChat(alice.accessToken, bobId);

    const aliceWs = connectWs(alice.accessToken);
    const bobWs = connectWs(bob.accessToken);

    await Promise.all([wsOpen(aliceWs), wsOpen(bobWs)]);

    // Give gateway time to subscribe to Redis channels
    await new Promise((r) => setTimeout(r, 200));

    const bobReceived = waitForMessage(bobWs, 'message.new');

    aliceWs.send(JSON.stringify({
      type: 'message.send',
      id: 'req-1',
      payload: {
        chatId: chat.id,
        type: 'TEXT',
        ciphertext: 'aGVsbG8gd29ybGQ=', // base64 "hello world"
      },
    }));

    const msg = await bobReceived;
    expect((msg as { payload: { chatId: string } }).payload.chatId).toBe(chat.id);

    aliceWs.close();
    bobWs.close();
  });

  it('Bob sends receipt.read and Alice receives receipt.update', async () => {
    const alice = await register('+15551000001', 'Alice');
    const bob = await register('+15551000002', 'Bob');

    const bobId = (await getMe(bob.accessToken)).id;
    const chat = await createChat(alice.accessToken, bobId);

    const aliceWs = connectWs(alice.accessToken);
    const bobWs = connectWs(bob.accessToken);
    await Promise.all([wsOpen(aliceWs), wsOpen(bobWs)]);
    await new Promise((r) => setTimeout(r, 200));

    // Alice sends a message, wait for Bob to receive it
    const bobReceived = waitForMessage(bobWs, 'message.new');
    aliceWs.send(JSON.stringify({
      type: 'message.send',
      payload: { chatId: chat.id, type: 'TEXT', ciphertext: 'dGVzdA==' },
    }));
    const newMsg = await bobReceived;
    const messageId = (newMsg as { payload: { id: string } }).payload.id;

    // Bob sends read receipt, Alice should get receipt.update
    const aliceReceiptUpdate = waitForMessage(aliceWs, 'receipt.update');
    bobWs.send(JSON.stringify({
      type: 'receipt.read',
      payload: { messageId, chatId: chat.id },
    }));

    const receipt = await aliceReceiptUpdate;
    expect((receipt as { payload: { status: string } }).payload.status).toBe('READ');

    aliceWs.close();
    bobWs.close();
  });

  it('WS rejects connection with invalid token', async () => {
    const ws = new WebSocket(`${wsUrl}/ws?token=invalid-token`);
    const closed = new Promise<number>((resolve) => {
      ws.once('close', (code) => resolve(code));
    });
    const code = await closed;
    expect(code).toBe(1008); // Policy Violation
  });

  it('typing indicators are forwarded to chat members', async () => {
    const alice = await register('+15551000001', 'Alice');
    const bob = await register('+15551000002', 'Bob');
    const bobId = (await getMe(bob.accessToken)).id;
    const chat = await createChat(alice.accessToken, bobId);

    const aliceWs = connectWs(alice.accessToken);
    const bobWs = connectWs(bob.accessToken);
    await Promise.all([wsOpen(aliceWs), wsOpen(bobWs)]);
    await new Promise((r) => setTimeout(r, 200));

    const bobTyping = waitForMessage(bobWs, 'typing');
    aliceWs.send(JSON.stringify({ type: 'typing.start', payload: { chatId: chat.id } }));

    const typing = await bobTyping;
    expect((typing as { payload: { typing: boolean } }).payload.typing).toBe(true);

    aliceWs.close();
    bobWs.close();
  });
});
