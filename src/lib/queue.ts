import { Queue, Worker, type Job } from 'bullmq';
import { config } from '../config/index.js';

const connection = { url: config.REDIS_URL };

export const QUEUES = {
  MEDIA_THUMBNAILS: 'media-thumbnails',
  PUSH_NOTIFICATIONS: 'push-notifications',
} as const;

const queues = new Map<string, Queue>();

export function getQueue(name: string): Queue {
  let q = queues.get(name);
  if (!q) {
    q = new Queue(name, { connection });
    queues.set(name, q);
  }
  return q;
}

export function createWorker<T>(
  name: string,
  processor: (job: Job<T>) => Promise<void>,
  concurrency = 5,
): Worker<T> {
  return new Worker<T>(name, processor, { connection, concurrency });
}

export async function closeQueues(): Promise<void> {
  await Promise.all([...queues.values()].map((q) => q.close()));
  queues.clear();
}

// Job data types
export interface ThumbnailJobData {
  mediaId: string;
  s3Key: string;
  mimeType: string;
}

export interface PushJobData {
  userId: string;
  token: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}
