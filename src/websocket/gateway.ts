import type { FastifyInstance } from 'fastify';
import type { WebSocket } from '@fastify/websocket';
import { getSubscriber } from '../lib/redis.js';
import { getPrisma } from '../lib/prisma.js';
import { ChatRepository } from '../modules/chats/repository.js';
import { UnauthorizedError, WsError } from '../shared/errors.js';
import { setOnline, setOffline, refreshPresence } from './presence.js';
import { handleMessageSend, handleMessageDelete, handleMessageReact } from './handlers/message.js';
import { handleReceiptDelivered, handleReceiptRead } from './handlers/receipt.js';
import { handleTypingStart, handleTypingStop } from './handlers/typing.js';
import type { WsMessage, WsHandler } from '../shared/types.js';

// userId → set of open sockets (multi-tab support within one instance)
const connections = new Map<string, Set<WebSocket>>();

// chatId → already subscribed on this Redis subscriber
const subscribedChats = new Set<string>();

const handlers: Record<string, WsHandler> = {
  'message.send': handleMessageSend,
  'message.delete': handleMessageDelete,
  'message.react': handleMessageReact,
  'receipt.delivered': handleReceiptDelivered,
  'receipt.read': handleReceiptRead,
  'typing.start': handleTypingStart,
  'typing.stop': handleTypingStop,
};

function send(socket: WebSocket, data: unknown): void {
  if (socket.readyState === socket.OPEN) {
    socket.send(JSON.stringify(data));
  }
}

function broadcastToUser(userId: string, data: unknown): void {
  const sockets = connections.get(userId);
  if (!sockets) return;
  for (const socket of sockets) {
    send(socket, data);
  }
}

async function subscribeToChat(chatId: string): Promise<void> {
  if (subscribedChats.has(chatId)) return;
  subscribedChats.add(chatId);
  await getSubscriber().subscribe(`chat:${chatId}`);
}

async function subscribeToPresence(userId: string): Promise<void> {
  await getSubscriber().subscribe(`presence:${userId}`);
}

// Redis subscriber message dispatch
export function initRedisSubscriber(app: FastifyInstance): void {
  getSubscriber().on('message', (channel: string, message: string) => {
    try {
      const data = JSON.parse(message) as { chatId?: string; userId?: string; type: string; payload: unknown };

      if (channel.startsWith('chat:')) {
        const chatId = channel.slice(5);
        // Fan-out to all locally connected members of this chat
        for (const [userId, sockets] of connections.entries()) {
          // We need to know if this userId is in this chatId.
          // We optimistically push to all connected users and let the client ignore if not relevant.
          // For a production system you'd maintain a chatId→userIds mapping in Redis.
          // Here we track it in-process via a reverse index built on subscribe.
          void pushToChatMembers(chatId, data);
          break; // handled in pushToChatMembers — don't iterate
        }
        void pushToChatMembers(chatId, data);
      } else if (channel.startsWith('presence:')) {
        // Fan-out presence updates to contacts who are online
        const update = data as { userId: string; online: boolean; lastSeen?: string };
        // Notify all locally connected users (they filter on client)
        for (const [, sockets] of connections.entries()) {
          for (const socket of sockets) {
            send(socket, { type: 'presence.update', payload: update });
          }
        }
      }
    } catch (err) {
      app.log.error({ err }, 'Redis subscriber dispatch error');
    }
  });
}

// chatId → Set<userId> for locally connected users
const chatMembers = new Map<string, Set<string>>();

function registerChatMembership(chatId: string, userId: string): void {
  let members = chatMembers.get(chatId);
  if (!members) {
    members = new Set();
    chatMembers.set(chatId, members);
  }
  members.add(userId);
}

function unregisterChatMembership(chatId: string, userId: string): void {
  chatMembers.get(chatId)?.delete(userId);
}

async function pushToChatMembers(chatId: string, data: unknown): Promise<void> {
  const members = chatMembers.get(chatId);
  if (!members) return;
  for (const userId of members) {
    broadcastToUser(userId, data);
  }
}

export default async function wsGateway(app: FastifyInstance): Promise<void> {
  initRedisSubscriber(app);

  app.get('/ws', { websocket: true }, async (socket, req) => {
    // Auth: JWT in query param `token` or Authorization header
    let userId: string;
    try {
      const token =
        (req.query as Record<string, string>)['token'] ??
        req.headers['authorization']?.replace(/^Bearer\s+/i, '');

      if (!token) throw new UnauthorizedError('Missing token');

      const payload = app.jwt.verify<{ sub: string; deviceId: string }>(token);
      userId = payload.sub;
    } catch {
      send(socket, { type: 'error', payload: { code: 'UNAUTHORIZED', message: 'Invalid token' } });
      socket.close(1008, 'Unauthorized');
      return;
    }

    // Register connection
    let userSockets = connections.get(userId);
    if (!userSockets) {
      userSockets = new Set();
      connections.set(userId, userSockets);
    }
    userSockets.add(socket);

    app.log.info({ userId }, 'WS connected');

    // Subscribe to user's chats
    const chatRepo = new ChatRepository(getPrisma());
    const chatIds = await chatRepo.getChatMemberIds(userId)
      .then(() => chatRepo.listForUser(userId))
      .then((chats) => chats.map((c) => c.id));

    for (const chatId of chatIds) {
      await subscribeToChat(chatId);
      registerChatMembership(chatId, userId);
    }

    await subscribeToPresence(userId);
    await setOnline(userId);

    // Heartbeat — ping every 30s from client keeps presence alive
    socket.on('message', async (raw) => {
      let msg: WsMessage;
      try {
        msg = JSON.parse(raw.toString()) as WsMessage;
      } catch {
        send(socket, { type: 'error', payload: { code: 'INVALID_JSON', message: 'Invalid JSON' } });
        return;
      }

      if (msg.type === 'presence.ping') {
        await refreshPresence(userId);
        send(socket, { type: 'presence.pong', id: msg.id });
        return;
      }

      const handler = handlers[msg.type];
      if (!handler) {
        send(socket, { type: 'error', payload: { code: 'UNKNOWN_TYPE', message: `Unknown type: ${msg.type}` }, id: msg.id });
        return;
      }

      try {
        await handler(userId, msg);
        if (msg.id) {
          send(socket, { type: 'ack', id: msg.id });
        }
      } catch (err) {
        if (err instanceof WsError) {
          send(socket, { type: 'error', payload: { code: err.code, message: err.message }, id: msg.id });
        } else {
          app.log.error({ err, userId, msgType: msg.type }, 'WS handler error');
          send(socket, { type: 'error', payload: { code: 'INTERNAL_ERROR', message: 'Internal error' }, id: msg.id });
        }
      }
    });

    socket.on('close', async () => {
      userSockets!.delete(socket);
      if (userSockets!.size === 0) {
        connections.delete(userId);
        await setOffline(userId);
      }

      // Unregister from chat membership
      for (const chatId of chatIds) {
        unregisterChatMembership(chatId, userId);
      }

      app.log.info({ userId }, 'WS disconnected');
    });

    socket.on('error', (err: Error) => {
      app.log.error({ err, userId }, 'WS socket error');
    });
  });
}
