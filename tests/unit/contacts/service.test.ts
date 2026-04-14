import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ContactService } from '../../../src/modules/contacts/service.js';
import type { ContactRepository } from '../../../src/modules/contacts/repository.js';
import type { UserRepository } from '../../../src/modules/users/repository.js';
import { ConflictError, NotFoundError, ValidationError } from '../../../src/shared/errors.js';

const mockContactRepo = {
  list: vi.fn(),
  find: vi.fn(),
  create: vi.fn(),
  delete: vi.fn(),
} satisfies Partial<ContactRepository> as unknown as ContactRepository;

const mockUserRepo = {
  findByPhone: vi.fn(),
} satisfies Partial<UserRepository> as unknown as UserRepository;

const fakeContact = {
  userId: 'u1',
  contactUserId: 'u2',
  nickname: null,
  createdAt: new Date(),
  contact: { id: 'u2', phoneNumber: '+2', displayName: 'Bob', avatarKey: null, about: null },
};

describe('ContactService', () => {
  let service: ContactService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ContactService(mockContactRepo, mockUserRepo);
  });

  describe('add', () => {
    it('creates contact for valid phone', async () => {
      mockUserRepo.findByPhone = vi.fn().mockResolvedValue({ id: 'u2', phoneNumber: '+2' });
      mockContactRepo.find = vi.fn().mockResolvedValue(null);
      mockContactRepo.create = vi.fn().mockResolvedValue(fakeContact);

      const result = await service.add('u1', { phoneNumber: '+2' });

      expect(result.contactUserId).toBe('u2');
      expect(mockContactRepo.create).toHaveBeenCalledWith({ userId: 'u1', contactUserId: 'u2', nickname: undefined });
    });

    it('throws NotFoundError for unknown phone', async () => {
      mockUserRepo.findByPhone = vi.fn().mockResolvedValue(null);

      await expect(service.add('u1', { phoneNumber: '+999' })).rejects.toThrow(NotFoundError);
    });

    it('throws ValidationError when adding self', async () => {
      mockUserRepo.findByPhone = vi.fn().mockResolvedValue({ id: 'u1' });

      await expect(service.add('u1', { phoneNumber: '+1' })).rejects.toThrow(ValidationError);
    });

    it('throws ConflictError for duplicate contact', async () => {
      mockUserRepo.findByPhone = vi.fn().mockResolvedValue({ id: 'u2' });
      mockContactRepo.find = vi.fn().mockResolvedValue(fakeContact);

      await expect(service.add('u1', { phoneNumber: '+2' })).rejects.toThrow(ConflictError);
    });
  });

  describe('remove', () => {
    it('deletes existing contact', async () => {
      mockContactRepo.find = vi.fn().mockResolvedValue(fakeContact);
      mockContactRepo.delete = vi.fn().mockResolvedValue(undefined);

      await service.remove('u1', 'u2');

      expect(mockContactRepo.delete).toHaveBeenCalledWith('u1', 'u2');
    });

    it('throws NotFoundError for missing contact', async () => {
      mockContactRepo.find = vi.fn().mockResolvedValue(null);

      await expect(service.remove('u1', 'u99')).rejects.toThrow(NotFoundError);
    });
  });
});
