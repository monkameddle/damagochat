import { v4 as uuidv4 } from 'uuid';
import { getUploadPresignedUrl, getDownloadPresignedUrl, objectExists } from '../../lib/s3.js';
import { getRedis } from '../../lib/redis.js';
import { getQueue, QUEUES } from '../../lib/queue.js';
import { config } from '../../config/index.js';
import { ValidationError, NotFoundError, ForbiddenError } from '../../shared/errors.js';
import type { MediaRepository } from './repository.js';
import type { ChatRepository } from '../chats/repository.js';
import {
  pendingMediaKey,
  PENDING_MEDIA_TTL,
  type PrepareUploadInput,
  type PrepareUploadResult,
  type MediaObjectResult,
} from './schema.js';

const MAX_BYTES = config.MEDIA_MAX_SIZE_MB * 1024 * 1024;

export class MediaService {
  constructor(
    private readonly mediaRepo: MediaRepository,
    private readonly chatRepo: ChatRepository,
  ) {}

  async prepareUpload(
    userId: string,
    input: PrepareUploadInput,
  ): Promise<PrepareUploadResult> {
    if (input.sizeBytes > MAX_BYTES) {
      throw new ValidationError(
        `File exceeds maximum size of ${config.MEDIA_MAX_SIZE_MB} MB`,
      );
    }

    const mediaId = uuidv4();
    const ext = mimeToExt(input.mimeType);
    const s3Key = `media/${userId}/${mediaId}.${ext}`;

    const uploadUrl = await getUploadPresignedUrl(s3Key, input.mimeType);

    // Store pending metadata in Redis
    await getRedis().set(
      pendingMediaKey(mediaId),
      JSON.stringify({ s3Key, mimeType: input.mimeType, sizeBytes: input.sizeBytes }),
      'EX',
      PENDING_MEDIA_TTL,
    );

    return { mediaId, uploadUrl, s3Key, expiresIn: 300 };
  }

  /** Called by WS message.send handler after message is persisted */
  async linkToMessage(
    mediaId: string,
    messageId: string,
  ): Promise<void> {
    const raw = await getRedis().get(pendingMediaKey(mediaId));
    if (!raw) throw new NotFoundError('Media', mediaId);

    const { s3Key, mimeType, sizeBytes } = JSON.parse(raw) as {
      s3Key: string;
      mimeType: string;
      sizeBytes: number;
    };

    const exists = await objectExists(s3Key);
    if (!exists) {
      throw new ValidationError('Media object not uploaded yet');
    }

    await this.mediaRepo.create({ id: mediaId, messageId, s3Key, mimeType, sizeBytes });
    await getRedis().del(pendingMediaKey(mediaId));

    // Dispatch thumbnail job for images
    if (mimeType.startsWith('image/')) {
      await getQueue(QUEUES.MEDIA_THUMBNAILS).add('thumbnail', {
        mediaId,
        s3Key,
        mimeType,
      });
    }
  }

  async getMedia(
    mediaId: string,
    userId: string,
    chatId: string,
  ): Promise<MediaObjectResult> {
    const isMember = await this.chatRepo.isMember(chatId, userId);
    if (!isMember) throw new ForbiddenError('Not a member of this chat');

    const media = await this.mediaRepo.findById(mediaId);
    if (!media) throw new NotFoundError('Media', mediaId);

    const [downloadUrl, thumbnailUrl] = await Promise.all([
      getDownloadPresignedUrl(media.s3Key),
      media.thumbnailKey ? getDownloadPresignedUrl(media.thumbnailKey) : Promise.resolve(null),
    ]);

    return {
      id: media.id,
      s3Key: media.s3Key,
      mimeType: media.mimeType,
      sizeBytes: media.sizeBytes,
      thumbnailKey: media.thumbnailKey,
      downloadUrl,
      thumbnailUrl,
    };
  }
}

function mimeToExt(mime: string): string {
  const map: Record<string, string> = {
    'image/jpeg': 'jpg',
    'image/png': 'png',
    'image/webp': 'webp',
    'video/mp4': 'mp4',
    'audio/ogg': 'ogg',
    'application/pdf': 'pdf',
  };
  return map[mime] ?? 'bin';
}
