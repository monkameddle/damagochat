import { describe, it, expect, vi, beforeEach } from 'vitest';
import { ChatService } from '../../../src/modules/chats/service.js';
import type { ChatRepository } from '../../../src/modules/chats/repository.js';
import { ForbiddenError, NotFoundError, ValidationError } from '../../../src/shared/errors.js';

const fakeChat = {
  id: 'chat-1',
  type: 'DIRECT' as const,
  name: null,
  avatarKey: null,
  createdAt: new Date(),
  members: [
    { userId: 'u1', role: 'MEMBER' as const, joinedAt: new Date(), user: { id: 'u1', displayName: 'Alice', avatarKey: null, phoneNumber: '+1' } },
    { userId: 'u2', role: 'MEMBER' as const, joinedAt: new Date(), user: { id: 'u2', displayName: 'Bob', avatarKey: null, phoneNumber: '+2' } },
  ],
};

const mockRepo = {
  listForUser: vi.fn(),
  findById: vi.fn(),
  findDirectChat: vi.fn(),
  createDirect: vi.fn(),
  createGroup: vi.fn(),
  update: vi.fn(),
  isMember: vi.fn(),
  getMemberRole: vi.fn(),
  removeMember: vi.fn(),
  getChatMemberIds: vi.fn(),
} satisfies Partial<ChatRepository> as unknown as ChatRepository;

describe('ChatService', () => {
  let service: ChatService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new ChatService(mockRepo);
  });

  describe('get', () => {
    it('returns chat for member', async () => {
      mockRepo.findById = vi.fn().mockResolvedValue(fakeChat);
      mockRepo.isMember = vi.fn().mockResolvedValue(true);

      const result = await service.get('chat-1', 'u1');

      expect(result.id).toBe('chat-1');
    });

    it('throws NotFoundError for unknown chat', async () => {
      mockRepo.findById = vi.fn().mockResolvedValue(null);

      await expect(service.get('nope', 'u1')).rejects.toThrow(NotFoundError);
    });

    it('throws ForbiddenError for non-member', async () => {
      mockRepo.findById = vi.fn().mockResolvedValue(fakeChat);
      mockRepo.isMember = vi.fn().mockResolvedValue(false);

      await expect(service.get('chat-1', 'u99')).rejects.toThrow(ForbiddenError);
    });
  });

  describe('create DIRECT', () => {
    it('returns existing direct chat if present', async () => {
      mockRepo.findDirectChat = vi.fn().mockResolvedValue(fakeChat);

      const result = await service.create('u1', { type: 'DIRECT', userId: 'u2' });

      expect(result.id).toBe('chat-1');
      expect(mockRepo.createDirect).not.toHaveBeenCalled();
    });

    it('creates new direct chat', async () => {
      mockRepo.findDirectChat = vi.fn().mockResolvedValue(null);
      mockRepo.createDirect = vi.fn().mockResolvedValue(fakeChat);

      await service.create('u1', { type: 'DIRECT', userId: 'u2' });

      expect(mockRepo.createDirect).toHaveBeenCalledWith('u1', 'u2');
    });

    it('throws ValidationError when creating chat with self', async () => {
      await expect(
        service.create('u1', { type: 'DIRECT', userId: 'u1' }),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('create GROUP', () => {
    it('creates group chat', async () => {
      const groupChat = { ...fakeChat, type: 'GROUP' as const, name: 'Dev Team' };
      mockRepo.createGroup = vi.fn().mockResolvedValue(groupChat);

      const result = await service.create('u1', {
        type: 'GROUP',
        name: 'Dev Team',
        memberIds: ['u2', 'u3'],
      });

      expect(result.name).toBe('Dev Team');
    });
  });

  describe('update', () => {
    it('throws ValidationError for DIRECT chat', async () => {
      mockRepo.findById = vi.fn().mockResolvedValue(fakeChat);

      await expect(service.update('chat-1', 'u1', { name: 'x' })).rejects.toThrow(ValidationError);
    });

    it('throws ForbiddenError for non-admin', async () => {
      mockRepo.findById = vi.fn().mockResolvedValue({ ...fakeChat, type: 'GROUP' });
      mockRepo.getMemberRole = vi.fn().mockResolvedValue('MEMBER');

      await expect(service.update('chat-1', 'u1', { name: 'x' })).rejects.toThrow(ForbiddenError);
    });

    it('updates group as admin', async () => {
      const group = { ...fakeChat, type: 'GROUP' as const, name: 'Old' };
      const updated = { ...group, name: 'New' };
      mockRepo.findById = vi.fn().mockResolvedValue(group);
      mockRepo.getMemberRole = vi.fn().mockResolvedValue('ADMIN');
      mockRepo.update = vi.fn().mockResolvedValue(updated);

      const result = await service.update('chat-1', 'u1', { name: 'New' });

      expect(result.name).toBe('New');
    });
  });

  describe('leave', () => {
    it('removes member', async () => {
      mockRepo.isMember = vi.fn().mockResolvedValue(true);
      mockRepo.removeMember = vi.fn().mockResolvedValue(undefined);

      await service.leave('chat-1', 'u1');

      expect(mockRepo.removeMember).toHaveBeenCalledWith('chat-1', 'u1');
    });

    it('throws ForbiddenError for non-member', async () => {
      mockRepo.isMember = vi.fn().mockResolvedValue(false);

      await expect(service.leave('chat-1', 'u99')).rejects.toThrow(ForbiddenError);
    });
  });
});
