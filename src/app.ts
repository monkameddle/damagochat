import Fastify from 'fastify';
import fastifyCors from '@fastify/cors';
import fastifyHelmet from '@fastify/helmet';
import fastifyRateLimit from '@fastify/rate-limit';
import fastifyWebsocket from '@fastify/websocket';
import { config } from './config/index.js';

import errorHandler from './plugins/error-handler.js';
import authPlugin from './plugins/auth.js';
import telemetryPlugin from './plugins/telemetry.js';

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
  await app.register((await import('./websocket/gateway.js')).default);

  // API v1
  await app.register(
    async (v1) => {
      await v1.register((await import('./modules/auth/router.js')).default, {
        prefix: '/auth',
      });
      await v1.register((await import('./modules/users/router.js')).default, {
        prefix: '/users',
      });
      await v1.register((await import('./modules/contacts/router.js')).default, {
        prefix: '/contacts',
      });
      await v1.register((await import('./modules/chats/router.js')).default, {
        prefix: '/chats',
      });
      await v1.register((await import('./modules/messages/router.js')).default, {
        prefix: '/chats',
      });
      await v1.register((await import('./modules/media/router.js')).default, {
        prefix: '/media',
      });
      await v1.register((await import('./modules/encryption/router.js')).default, {
        prefix: '/encryption',
      });
      await v1.register((await import('./modules/notifications/router.js')).default, {
        prefix: '/notifications',
      });
      await v1.register((await import('./modules/search/router.js')).default, {
        prefix: '/search',
      });
    },
    { prefix: '/api/v1' },
  );

  return app;
}
