import { describe, it, expect, vi, beforeEach } from 'vitest';
import { MessageService } from '../../../src/modules/messages/service.js';
import type { MessageRepository } from '../../../src/modules/messages/repository.js';
import type { ChatRepository } from '../../../src/modules/chats/repository.js';
import { ForbiddenError, NotFoundError } from '../../../src/shared/errors.js';

const fakeMsg = {
  id: 'msg-1',
  chatId: 'chat-1',
  senderId: 'u1',
  type: 'TEXT',
  ciphertext: 'enc',
  mediaKey: null,
  status: 'sent',
  sentAt: new Date(),
  deletedAt: null,
  reactions: [],
  media: null,
};

const mockMsgRepo = {
  listForChat: vi.fn(),
  findById: vi.fn(),
} satisfies Partial<MessageRepository> as unknown as MessageRepository;

const mockChatRepo = {
  isMember: vi.fn(),
} satisfies Partial<ChatRepository> as unknown as ChatRepository;

describe('MessageService', () => {
  let service: MessageService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new MessageService(mockMsgRepo, mockChatRepo);
  });

  describe('list', () => {
    it('returns paginated messages for member', async () => {
      mockChatRepo.isMember = vi.fn().mockResolvedValue(true);
      mockMsgRepo.listForChat = vi.fn().mockResolvedValue([fakeMsg]);

      const result = await service.list('chat-1', 'u1', { limit: 50 });

      expect(result.items).toHaveLength(1);
      expect(result.nextCursor).toBeUndefined();
    });

    it('sets nextCursor when full page returned', async () => {
      const msgs = Array.from({ length: 50 }, (_, i) => ({
        ...fakeMsg,
        id: `msg-${i}`,
        sentAt: new Date(Date.now() - i * 1000),
      }));
      mockChatRepo.isMember = vi.fn().mockResolvedValue(true);
      mockMsgRepo.listForChat = vi.fn().mockResolvedValue(msgs);

      const result = await service.list('chat-1', 'u1', { limit: 50 });

      expect(result.nextCursor).toBeDefined();
    });

    it('throws ForbiddenError for non-member', async () => {
      mockChatRepo.isMember = vi.fn().mockResolvedValue(false);

      await expect(service.list('chat-1', 'u99', { limit: 50 })).rejects.toThrow(ForbiddenError);
    });
  });

  describe('getOne', () => {
    it('returns message for member', async () => {
      mockChatRepo.isMember = vi.fn().mockResolvedValue(true);
      mockMsgRepo.findById = vi.fn().mockResolvedValue(fakeMsg);

      const result = await service.getOne('chat-1', 'msg-1', 'u1');

      expect(result.id).toBe('msg-1');
    });

    it('throws NotFoundError for wrong chatId', async () => {
      mockChatRepo.isMember = vi.fn().mockResolvedValue(true);
      mockMsgRepo.findById = vi.fn().mockResolvedValue({ ...fakeMsg, chatId: 'chat-99' });

      await expect(service.getOne('chat-1', 'msg-1', 'u1')).rejects.toThrow(NotFoundError);
    });

    it('throws NotFoundError for missing message', async () => {
      mockChatRepo.isMember = vi.fn().mockResolvedValue(true);
      mockMsgRepo.findById = vi.fn().mockResolvedValue(null);

      await expect(service.getOne('chat-1', 'msg-x', 'u1')).rejects.toThrow(NotFoundError);
    });
  });
});
