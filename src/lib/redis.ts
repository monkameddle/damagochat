import Redis from 'ioredis';
import { config } from '../config/index.js';

let _client: Redis | null = null;
let _subscriber: Redis | null = null;
let _publisher: Redis | null = null;

function createClient(name: string): Redis {
  const client = new Redis(config.REDIS_URL, {
    maxRetriesPerRequest: 3,
    lazyConnect: true,
    connectionName: name,
  });

  client.on('error', (err: Error) => {
    // logger not available here; use process stderr
    process.stderr.write(`[redis:${name}] error: ${err.message}\n`);
  });

  return client;
}

export function getRedis(): Redis {
  if (!_client) {
    _client = createClient('main');
  }
  return _client;
}

export function getSubscriber(): Redis {
  if (!_subscriber) {
    _subscriber = createClient('subscriber');
  }
  return _subscriber;
}

export function getPublisher(): Redis {
  if (!_publisher) {
    _publisher = createClient('publisher');
  }
  return _publisher;
}

export async function connectRedis(): Promise<void> {
  await Promise.all([
    getRedis().connect(),
    getSubscriber().connect(),
    getPublisher().connect(),
  ]);
}

export async function disconnectRedis(): Promise<void> {
  await Promise.all([
    _client?.quit(),
    _subscriber?.quit(),
    _publisher?.quit(),
  ]);
  _client = null;
  _subscriber = null;
  _publisher = null;
}

// Presence keys
export const presenceKey = (userId: string) => `presence:${userId}`;
export const PRESENCE_TTL_SECONDS = 35;
