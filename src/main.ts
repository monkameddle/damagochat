// OpenTelemetry must be initialised before any other imports
import { initTelemetry, shutdownTelemetry } from './lib/telemetry.js';
initTelemetry();

import { buildApp } from './app.js';
import { config } from './config/index.js';
import { connectRedis, disconnectRedis } from './lib/redis.js';
import { getPrisma, disconnectPrisma } from './lib/prisma.js';
import { startThumbnailWorker } from './jobs/thumbnail-worker.js';
import { startPushWorker } from './jobs/push-worker.js';
import { initSearchIndexes } from './lib/meilisearch.js';
import { closeQueues } from './lib/queue.js';

async function main() {
  const app = await buildApp();

  // Connect infrastructure
  await connectRedis();
  app.log.info('Redis connected');

  await getPrisma().$connect();
  app.log.info('Database connected');

  // Init search indexes (idempotent)
  await initSearchIndexes().catch((err: unknown) => {
    app.log.warn({ err }, 'Meilisearch index init failed - search may be degraded');
  });
  app.log.info('Search indexes ready');

  // Start BullMQ workers
  startThumbnailWorker();
  startPushWorker();
  app.log.info('Workers started');

  // Graceful shutdown
  const shutdown = async (signal: string) => {
    app.log.info({ signal }, 'Shutting down');
    await app.close();
    await closeQueues();
    await disconnectRedis();
    await disconnectPrisma();
    await shutdownTelemetry();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));

  try {
    await app.listen({ port: config.PORT, host: '0.0.0.0' });
  } catch (err) {
    app.log.fatal({ err }, 'Failed to start server');
    process.exit(1);
  }
}

main().catch((err: unknown) => {
  process.stderr.write(`Fatal: ${String(err)}\n`);
  process.exit(1);
});
