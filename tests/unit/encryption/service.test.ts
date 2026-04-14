import { describe, it, expect, vi, beforeEach } from 'vitest';
import { EncryptionService } from '../../../src/modules/encryption/service.js';
import type { EncryptionRepository } from '../../../src/modules/encryption/repository.js';
import { NotFoundError, ValidationError } from '../../../src/shared/errors.js';

vi.mock('../../../src/lib/signal.js', () => ({
  verifySignedPreKey: vi.fn().mockReturnValue(true),
}));

const fakeBundle = {
  id: 'bundle-1',
  userId: 'u1',
  deviceId: 'dev-1',
  identityKey: 'aWRlbnRpdHlLZXk=',
  signedPreKey: { keyId: 1, publicKey: 'c2lnbmVkUHJlS2V5', signature: 'c2ln' },
  preKeys: [
    { keyId: 100, publicKey: 'cHJlS2V5MQ==' },
    { keyId: 101, publicKey: 'cHJlS2V5Mg==' },
  ],
  updatedAt: new Date(),
};

const mockRepo = {
  findBundle: vi.fn(),
  upsertBundle: vi.fn(),
  consumePreKey: vi.fn(),
  appendPreKeys: vi.fn(),
  countPreKeys: vi.fn(),
} satisfies Partial<EncryptionRepository> as unknown as EncryptionRepository;

describe('EncryptionService', () => {
  let service: EncryptionService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new EncryptionService(mockRepo);
  });

  describe('uploadBundle', () => {
    const validInput = {
      deviceId: 'dev-1',
      identityKey: 'aWRlbnRpdHlLZXk=',
      signedPreKey: { keyId: 1, publicKey: 'c2lnbmVkUHJlS2V5', signature: 'c2ln' },
      preKeys: [{ keyId: 100, publicKey: 'cHJlS2V5MQ==' }],
    };

    it('stores bundle when signature valid', async () => {
      mockRepo.upsertBundle = vi.fn().mockResolvedValue(undefined);

      await service.uploadBundle('u1', validInput);

      expect(mockRepo.upsertBundle).toHaveBeenCalledWith(
        expect.objectContaining({ userId: 'u1', deviceId: 'dev-1' }),
      );
    });

    it('throws ValidationError when signature invalid', async () => {
      const { verifySignedPreKey } = await import('../../../src/lib/signal.js');
      vi.mocked(verifySignedPreKey).mockReturnValueOnce(false);

      await expect(service.uploadBundle('u1', validInput)).rejects.toThrow(ValidationError);
    });
  });

  describe('fetchBundle', () => {
    it('returns bundle with one consumed pre-key', async () => {
      mockRepo.findBundle = vi.fn().mockResolvedValue(fakeBundle);
      mockRepo.consumePreKey = vi.fn().mockResolvedValue({
        preKey: { keyId: 100, publicKey: 'cHJlS2V5MQ==' },
        remaining: 1,
      });

      const result = await service.fetchBundle('u2', 'u1');

      expect(result.userId).toBe('u1');
      expect(result.preKey).toEqual({ keyId: 100, publicKey: 'cHJlS2V5MQ==' });
      expect(mockRepo.consumePreKey).toHaveBeenCalledWith('u1');
    });

    it('returns null preKey when exhausted', async () => {
      mockRepo.findBundle = vi.fn().mockResolvedValue(fakeBundle);
      mockRepo.consumePreKey = vi.fn().mockResolvedValue({ preKey: null, remaining: 0 });

      const result = await service.fetchBundle('u2', 'u1');

      expect(result.preKey).toBeNull();
    });

    it('throws NotFoundError when no bundle exists', async () => {
      mockRepo.findBundle = vi.fn().mockResolvedValue(null);

      await expect(service.fetchBundle('u2', 'u99')).rejects.toThrow(NotFoundError);
    });
  });

  describe('replenishPreKeys', () => {
    it('appends new pre-keys', async () => {
      mockRepo.findBundle = vi.fn().mockResolvedValue(fakeBundle);
      mockRepo.appendPreKeys = vi.fn().mockResolvedValue(undefined);

      await service.replenishPreKeys('u1', [{ keyId: 200, publicKey: 'bmV3S2V5' }]);

      expect(mockRepo.appendPreKeys).toHaveBeenCalledWith(
        'u1',
        [{ keyId: 200, publicKey: 'bmV3S2V5' }],
      );
    });

    it('throws ValidationError for empty array', async () => {
      mockRepo.findBundle = vi.fn().mockResolvedValue(fakeBundle);

      await expect(service.replenishPreKeys('u1', [])).rejects.toThrow(ValidationError);
    });

    it('throws NotFoundError when no bundle exists', async () => {
      mockRepo.findBundle = vi.fn().mockResolvedValue(null);

      await expect(
        service.replenishPreKeys('u99', [{ keyId: 1, publicKey: 'a' }]),
      ).rejects.toThrow(NotFoundError);
    });
  });

  describe('getPreKeyCount', () => {
    it('returns count from repo', async () => {
      mockRepo.countPreKeys = vi.fn().mockResolvedValue(42);

      const count = await service.getPreKeyCount('u1');

      expect(count).toBe(42);
    });
  });
});
