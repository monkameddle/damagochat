import { PostgreSqlContainer, type StartedPostgreSqlContainer } from 'testcontainers';
import { GenericContainer, type StartedTestContainer } from 'testcontainers';
import { execSync } from 'child_process';
import { PrismaClient } from '@prisma/client';
import Redis from 'ioredis';

export interface TestInfra {
  prisma: PrismaClient;
  redis: Redis;
  redisUrl: string;
  databaseUrl: string;
  teardown: () => Promise<void>;
}

export async function startInfra(): Promise<TestInfra> {
  const [pgContainer, redisContainer] = await Promise.all([
    new PostgreSqlContainer('postgres:16-alpine').start(),
    new GenericContainer('redis:7-alpine').withExposedPorts(6379).start(),
  ]);

  const databaseUrl = pgContainer.getConnectionUri();
  const redisUrl = `redis://${redisContainer.getHost()}:${redisContainer.getMappedPort(6379)}`;

  process.env['DATABASE_URL'] = databaseUrl;
  process.env['REDIS_URL'] = redisUrl;

  // Run migrations
  execSync('npx prisma migrate deploy', {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'pipe',
  });

  const prisma = new PrismaClient({ datasources: { db: { url: databaseUrl } } });
  await prisma.$connect();

  const redis = new Redis(redisUrl, { lazyConnect: true });
  await redis.connect();

  const teardown = async () => {
    await prisma.$disconnect();
    await redis.quit();
    await pgContainer.stop();
    await redisContainer.stop();
  };

  return { prisma, redis, redisUrl, databaseUrl, teardown };
}

export async function cleanDb(prisma: PrismaClient): Promise<void> {
  // Delete in dependency order
  await prisma.$executeRawUnsafe('TRUNCATE TABLE "MessageReaction", "MessageStatus", "MediaObject", "Message", "ChatMember", "Chat", "Contact", "PreKeyBundle", "Session", "User" CASCADE');
}
