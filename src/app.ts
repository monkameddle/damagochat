import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyWebsocket from '@fastify/websocket';
import { config } from './config/index.js';

import errorHandler from './plugins/error-handler.js';
import authPlugin from './plugins/auth.js';
import telemetryPlugin from './plugins/telemetry.js';

import wsGateway from './websocket/gateway.js';
import authRouter from './modules/auth/router.js';
import usersRouter from './modules/users/router.js';
import contactsRouter from './modules/contacts/router.js';
import chatsRouter from './modules/chats/router.js';
import messagesRouter from './modules/messages/router.js';
import mediaRouter from './modules/media/router.js';
import encryptionRouter from './modules/encryption/router.js';
import notificationsRouter from './modules/notifications/router.js';
import searchRouter from './modules/search/router.js';

export async function buildApp() {
  const app = Fastify({
    logger: {
      level: config.LOG_LEVEL,
      ...(config.NODE_ENV === 'development' && {
        transport: { target: 'pino-pretty', options: { colorize: true } },
      }),
    },
    ajv: {
      customOptions: {
        strict: 'log',
        keywords: ['kind', 'modifier'],
      },
    },
  });

  // Core plugins
  await app.register(fastifyCors, {
    origin: config.NODE_ENV === 'production' ? false : true,
    credentials: true,
  });

  await app.register(fastifyHelmet, {
    contentSecurityPolicy: false,
  });

  await app.register(fastifyRateLimit, {
    global: false,
    redis: undefined, // modules configure per-route limits
  });

  await app.register(fastifyWebsocket);

  // App plugins
  await app.register(errorHandler);
  await app.register(authPlugin);
  await app.register(telemetryPlugin);

  // Health check
  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  // WebSocket gateway
  await app.register(wsGateway);

  // API v1
  await app.register(
    async (v1) => {
      await v1.register(authRouter, { prefix: '/auth' });
      await v1.register(usersRouter, { prefix: '/users' });
      await v1.register(contactsRouter, { prefix: '/contacts' });
      await v1.register(chatsRouter, { prefix: '/chats' });
      await v1.register(messagesRouter, { prefix: '/chats' });
      await v1.register(mediaRouter, { prefix: '/media' });
      await v1.register(encryptionRouter, { prefix: '/encryption' });
      await v1.register(notificationsRouter, { prefix: '/notifications' });
      await v1.register(searchRouter, { prefix: '/search' });
    },
    { prefix: '/api/v1' },
  );

  return app;
}
