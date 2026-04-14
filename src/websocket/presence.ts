import {
  getRedis,
  getPublisher,
  presenceKey,
  PRESENCE_TTL_SECONDS,
} from '../lib/redis.js';

export async function setOnline(userId: string): Promise<void> {
  await getRedis().set(presenceKey(userId), '1', 'EX', PRESENCE_TTL_SECONDS);
  await getPublisher().publish(
    `presence:${userId}`,
    JSON.stringify({ userId, online: true }),
  );
}

export async function refreshPresence(userId: string): Promise<void> {
  await getRedis().expire(presenceKey(userId), PRESENCE_TTL_SECONDS);
}

export async function setOffline(userId: string): Promise<void> {
  const lastSeen = new Date().toISOString();
  await getRedis().del(presenceKey(userId));
  await getPublisher().publish(
    `presence:${userId}`,
    JSON.stringify({ userId, online: false, lastSeen }),
  );
}

export async function isOnline(userId: string): Promise<boolean> {
  const val = await getRedis().exists(presenceKey(userId));
  return val === 1;
}

export async function getPresence(
  userIds: string[],
): Promise<Record<string, boolean>> {
  if (userIds.length === 0) return {};
  const pipeline = getRedis().pipeline();
  for (const id of userIds) pipeline.exists(presenceKey(id));
  const results = await pipeline.exec();
  return Object.fromEntries(
    userIds.map((id, i) => [id, (results?.[i]?.[1] as number) === 1]),
  );
}
