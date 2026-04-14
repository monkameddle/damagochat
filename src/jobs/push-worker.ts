import type { Job } from 'bullmq';
import { createWorker, QUEUES, type PushJobData } from '../lib/queue.js';
import { sendPushNotification } from '../lib/push.js';

async function processJob(job: Job<PushJobData>): Promise<void> {
  const { token, title, body, data } = job.data;

  await sendPushNotification(token, {
    title,
    body,
    ...(data !== undefined && { data }),
  });
}

export function startPushWorker() {
  const worker = createWorker<PushJobData>(
    QUEUES.PUSH_NOTIFICATIONS,
    processJob,
    10,
  );

  worker.on('completed', (job) => {
    process.stdout.write(`[push-worker] sent to token ${job.data.token.slice(0, 8)}…\n`);
  });

  worker.on('failed', (job, err) => {
    process.stderr.write(`[push-worker] failed job ${job?.id}: ${err.message}\n`);
  });

  return worker;
}
