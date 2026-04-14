import {
  S3Client,
  PutObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  DeleteObjectCommand,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { config } from '../config/index.js';

let _s3: S3Client | null = null;

export function getS3(): S3Client {
  if (!_s3) {
    _s3 = new S3Client({
      endpoint: config.S3_ENDPOINT,
      region: config.S3_REGION,
      credentials: {
        accessKeyId: config.S3_ACCESS_KEY,
        secretAccessKey: config.S3_SECRET_KEY,
      },
      forcePathStyle: config.S3_FORCE_PATH_STYLE,
    });
  }
  return _s3;
}

export async function getUploadPresignedUrl(
  key: string,
  mimeType: string,
  expiresIn = 300,
): Promise<string> {
  const cmd = new PutObjectCommand({
    Bucket: config.S3_BUCKET,
    Key: key,
    ContentType: mimeType,
  });
  return getSignedUrl(getS3(), cmd, { expiresIn });
}

export async function getDownloadPresignedUrl(
  key: string,
  expiresIn = 300,
): Promise<string> {
  const cmd = new GetObjectCommand({
    Bucket: config.S3_BUCKET,
    Key: key,
  });
  return getSignedUrl(getS3(), cmd, { expiresIn });
}

export async function objectExists(key: string): Promise<boolean> {
  try {
    await getS3().send(new HeadObjectCommand({ Bucket: config.S3_BUCKET, Key: key }));
    return true;
  } catch {
    return false;
  }
}

export async function deleteObject(key: string): Promise<void> {
  await getS3().send(new DeleteObjectCommand({ Bucket: config.S3_BUCKET, Key: key }));
}
