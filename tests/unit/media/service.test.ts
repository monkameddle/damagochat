import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MediaService } from '../../../src/modules/media/service.js';
import type { MediaRepository } from '../../../src/modules/media/repository.js';
import type { ChatRepository } from '../../../src/modules/chats/repository.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../../../src/shared/errors.js';

vi.mock('../../../src/config/index.js', () => ({
  config: { MEDIA_MAX_SIZE_MB: 64, S3_BUCKET: 'test-bucket' },
}));

vi.mock('../../../src/lib/s3.js', () => ({
  getUploadPresignedUrl: vi.fn().mockResolvedValue('https://s3.example.com/upload'),
  getDownloadPresignedUrl: vi.fn().mockResolvedValue('https://s3.example.com/download'),
  objectExists: vi.fn().mockResolvedValue(true),
}));

vi.mock('../../../src/lib/redis.js', () => ({
  getRedis: vi.fn(() => ({
    set: vi.fn().mockResolvedValue('OK'),
    get: vi.fn(),
    del: vi.fn().mockResolvedValue(1),
  })),
}));

vi.mock('../../../src/lib/queue.js', () => ({
  getQueue: vi.fn(() => ({ add: vi.fn().mockResolvedValue({}) })),
  QUEUES: { MEDIA_THUMBNAILS: 'media-thumbnails' },
}));

vi.mock('uuid', () => ({ v4: vi.fn().mockReturnValue('media-uuid-1') }));

const mockMediaRepo = {
  create: vi.fn(),
  findById: vi.fn(),
  findByMessageId: vi.fn(),
  updateThumbnail: vi.fn(),
} satisfies Partial<MediaRepository> as unknown as MediaRepository;

const mockChatRepo = {
  isMember: vi.fn(),
} satisfies Partial<ChatRepository> as unknown as ChatRepository;

describe('MediaService', () => {
  let service: MediaService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new MediaService(mockMediaRepo, mockChatRepo);
  });

  describe('prepareUpload', () => {
    it('returns uploadUrl and mediaId for valid input', async () => {
      const result = await service.prepareUpload('u1', {
        mimeType: 'image/jpeg',
        sizeBytes: 1024,
      });

      expect(result.mediaId).toBe('media-uuid-1');
      expect(result.uploadUrl).toBe('https://s3.example.com/upload');
      expect(result.s3Key).toContain('media/u1/');
    });

    it('throws ValidationError when file too large', async () => {
      await expect(
        service.prepareUpload('u1', {
          mimeType: 'image/jpeg',
          sizeBytes: 64 * 1024 * 1024 + 1,
        }),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('linkToMessage', () => {
    it('creates MediaObject and dispatches thumbnail job for image', async () => {
      const { getRedis } = await import('../../../src/lib/redis.js');
      vi.mocked(getRedis().get).mockResolvedValue(
        JSON.stringify({ s3Key: 'media/u1/abc.jpg', mimeType: 'image/jpeg', sizeBytes: 1024 }),
      );
      mockMediaRepo.create = vi.fn().mockResolvedValue({});

      await service.linkToMessage('media-uuid-1', 'msg-1');

      expect(mockMediaRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({ messageId: 'msg-1', mimeType: 'image/jpeg' }),
      );

      const { getQueue } = await import('../../../src/lib/queue.js');
      expect(vi.mocked(getQueue)().add).toHaveBeenCalledWith('thumbnail', expect.objectContaining({ mediaId: 'media-uuid-1' }));
    });

    it('throws NotFoundError when pending key missing', async () => {
      const { getRedis } = await import('../../../src/lib/redis.js');
      vi.mocked(getRedis().get).mockResolvedValue(null);

      await expect(service.linkToMessage('bad-id', 'msg-1')).rejects.toThrow(NotFoundError);
    });

    it('throws ValidationError when S3 object not uploaded', async () => {
      const { getRedis } = await import('../../../src/lib/redis.js');
      vi.mocked(getRedis().get).mockResolvedValue(
        JSON.stringify({ s3Key: 'media/u1/abc.jpg', mimeType: 'image/jpeg', sizeBytes: 1024 }),
      );
      const { objectExists } = await import('../../../src/lib/s3.js');
      vi.mocked(objectExists).mockResolvedValueOnce(false);

      await expect(service.linkToMessage('media-uuid-1', 'msg-1')).rejects.toThrow(ValidationError);
    });
  });

  describe('getMedia', () => {
    it('returns media with presigned URLs for chat member', async () => {
      mockChatRepo.isMember = vi.fn().mockResolvedValue(true);
      mockMediaRepo.findById = vi.fn().mockResolvedValue({
        id: 'media-1',
        s3Key: 'media/u1/x.jpg',
        mimeType: 'image/jpeg',
        sizeBytes: 2048,
        thumbnailKey: null,
      });

      const result = await service.getMedia('media-1', 'u1', 'chat-1');

      expect(result.downloadUrl).toBe('https://s3.example.com/download');
      expect(result.thumbnailUrl).toBeNull();
    });

    it('throws ForbiddenError for non-member', async () => {
      mockChatRepo.isMember = vi.fn().mockResolvedValue(false);

      await expect(service.getMedia('media-1', 'u99', 'chat-1')).rejects.toThrow(ForbiddenError);
    });

    it('throws NotFoundError for missing media', async () => {
      mockChatRepo.isMember = vi.fn().mockResolvedValue(true);
      mockMediaRepo.findById = vi.fn().mockResolvedValue(null);

      await expect(service.getMedia('media-x', 'u1', 'chat-1')).rejects.toThrow(NotFoundError);
    });
  });
});
