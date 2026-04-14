import { GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import sharp from 'sharp';
import { getS3 } from '../lib/s3.js';
import { config } from '../config/index.js';
import { createWorker, QUEUES, type ThumbnailJobData } from '../lib/queue.js';
import { getPrisma } from '../lib/prisma.js';
import { MediaRepository } from '../modules/media/repository.js';
import type { Job } from 'bullmq';

const THUMB_WIDTH = 320;
const THUMB_HEIGHT = 320;

async function processJob(job: Job<ThumbnailJobData>): Promise<void> {
  const { mediaId, s3Key, mimeType } = job.data;

  if (!mimeType.startsWith('image/')) return;

  const s3 = getS3();
  const bucket = config.S3_BUCKET;

  // Download original
  const getResult = await s3.send(
    new GetObjectCommand({ Bucket: bucket, Key: s3Key }),
  );

  const chunks: Uint8Array[] = [];
  const stream = getResult.Body as AsyncIterable<Uint8Array>;
  for await (const chunk of stream) {
    chunks.push(chunk);
  }
  const buffer = Buffer.concat(chunks);

  // Generate thumbnail
  const thumbBuffer = await sharp(buffer)
    .resize(THUMB_WIDTH, THUMB_HEIGHT, { fit: 'inside', withoutEnlargement: true })
    .webp({ quality: 80 })
    .toBuffer();

  const thumbKey = s3Key.replace(/\.[^.]+$/, '_thumb.webp');

  // Upload thumbnail
  await s3.send(
    new PutObjectCommand({
      Bucket: bucket,
      Key: thumbKey,
      Body: thumbBuffer,
      ContentType: 'image/webp',
    }),
  );

  // Update DB
  const repo = new MediaRepository(getPrisma());
  await repo.updateThumbnail(mediaId, thumbKey);
}

export function startThumbnailWorker() {
  const worker = createWorker<ThumbnailJobData>(
    QUEUES.MEDIA_THUMBNAILS,
    processJob,
    3,
  );

  worker.on('completed', (job) => {
    process.stdout.write(`[thumbnail-worker] completed job ${job.id}\n`);
  });

  worker.on('failed', (job, err) => {
    process.stderr.write(`[thumbnail-worker] failed job ${job?.id}: ${err.message}\n`);
  });

  return worker;
}
