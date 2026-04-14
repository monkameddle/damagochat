// OpenTelemetry must be initialised before any other imports
import { initTelemetry, shutdownTelemetry } from './lib/telemetry.js';
initTelemetry();

import { connectRedis, disconnectRedis } from './lib/redis.js';
import { getPrisma, disconnectPrisma } from './lib/prisma.js';
import { startThumbnailWorker } from './jobs/thumbnail-worker.js';
import { startPushWorker } from './jobs/push-worker.js';
import { closeQueues } from './lib/queue.js';

async function main() {
  await connectRedis();
  process.stdout.write('[worker] Redis connected\n');

  await getPrisma().$connect();
  process.stdout.write('[worker] Database connected\n');

  const thumbnailWorker = startThumbnailWorker();
  const pushWorker = startPushWorker();
  process.stdout.write('[worker] Workers started\n');

  const shutdown = async (signal: string) => {
    process.stdout.write(`[worker] Shutting down (${signal})\n`);
    await thumbnailWorker.close();
    await pushWorker.close();
    await closeQueues();
    await disconnectRedis();
    await disconnectPrisma();
    await shutdownTelemetry();
    process.exit(0);
  };

  process.on('SIGTERM', () => void shutdown('SIGTERM'));
  process.on('SIGINT', () => void shutdown('SIGINT'));
}

main().catch((err: unknown) => {
  process.stderr.write(`[worker] Fatal: ${String(err)}\n`);
  process.exit(1);
});
