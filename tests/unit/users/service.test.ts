import { describe, it, expect, vi, beforeEach } from 'vitest';
import { UserService } from '../../../src/modules/users/service.js';
import type { UserRepository } from '../../../src/modules/users/repository.js';
import { NotFoundError } from '../../../src/shared/errors.js';

vi.mock('../../../src/lib/meilisearch.js', () => ({
  getMeilisearch: vi.fn(() => ({
    index: vi.fn(() => ({
      search: vi.fn().mockResolvedValue({ hits: [] }),
      updateDocuments: vi.fn().mockResolvedValue({}),
    })),
  })),
  INDEXES: { USERS: 'users', MESSAGES: 'messages' },
}));

const mockRepo = {
  findById: vi.fn(),
  findByPhone: vi.fn(),
  updateMe: vi.fn(),
  findManyByIds: vi.fn(),
} satisfies Partial<UserRepository> as unknown as UserRepository;

describe('UserService', () => {
  let service: UserService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new UserService(mockRepo);
  });

  describe('getMe', () => {
    it('returns user when found', async () => {
      const user = { id: 'u1', phoneNumber: '+1', displayName: 'Alice', avatarKey: null, about: null, createdAt: new Date() };
      mockRepo.findById = vi.fn().mockResolvedValue(user);

      const result = await service.getMe('u1');

      expect(result).toEqual(user);
    });

    it('throws NotFoundError when user missing', async () => {
      mockRepo.findById = vi.fn().mockResolvedValue(null);

      await expect(service.getMe('u999')).rejects.toThrow(NotFoundError);
    });
  });

  describe('updateMe', () => {
    it('updates and returns user', async () => {
      const updated = { id: 'u1', phoneNumber: '+1', displayName: 'Alice B', avatarKey: null, about: null, createdAt: new Date() };
      mockRepo.updateMe = vi.fn().mockResolvedValue(updated);

      const result = await service.updateMe('u1', { displayName: 'Alice B' });

      expect(result.displayName).toBe('Alice B');
      expect(mockRepo.updateMe).toHaveBeenCalledWith('u1', { displayName: 'Alice B' });
    });
  });

  describe('searchUsers', () => {
    it('returns empty array when no hits', async () => {
      const result = await service.searchUsers('nobody');
      expect(result).toEqual([]);
    });
  });
});
