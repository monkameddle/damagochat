import { describe, it, expect, vi, beforeEach } from 'vitest';
import { SearchService } from '../../../src/modules/search/service.js';

const mockUserIndex = {
  search: vi.fn(),
  addDocuments: vi.fn().mockResolvedValue({}),
  deleteDocument: vi.fn().mockResolvedValue({}),
  deleteDocuments: vi.fn().mockResolvedValue({}),
};

const mockMessageIndex = {
  search: vi.fn(),
  addDocuments: vi.fn().mockResolvedValue({}),
  deleteDocument: vi.fn().mockResolvedValue({}),
  deleteDocuments: vi.fn().mockResolvedValue({}),
};

vi.mock('../../../src/lib/meilisearch.js', () => ({
  getMeilisearch: vi.fn(() => ({
    index: vi.fn((name: string) =>
      name === 'users' ? mockUserIndex : mockMessageIndex,
    ),
  })),
  INDEXES: { USERS: 'users', MESSAGES: 'messages' },
}));

describe('SearchService', () => {
  let service: SearchService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new SearchService();
  });

  describe('searchUsers', () => {
    it('returns mapped hits', async () => {
      mockUserIndex.search.mockResolvedValue({
        hits: [
          { id: 'u1', phoneNumber: '+1', displayName: 'Alice', avatarKey: null },
        ],
        estimatedTotalHits: 1,
      });

      const result = await service.searchUsers({ q: 'Alice', limit: 20, offset: 0 });

      expect(result.hits).toHaveLength(1);
      expect(result.hits[0]!.displayName).toBe('Alice');
      expect(result.total).toBe(1);
    });

    it('returns empty hits for no results', async () => {
      mockUserIndex.search.mockResolvedValue({ hits: [], estimatedTotalHits: 0 });

      const result = await service.searchUsers({ q: 'nobody', limit: 20, offset: 0 });

      expect(result.hits).toHaveLength(0);
    });
  });

  describe('searchMessages', () => {
    it('returns hits with highlight snippet', async () => {
      mockMessageIndex.search.mockResolvedValue({
        hits: [
          {
            id: 'msg-1',
            chatId: 'chat-1',
            senderId: 'u1',
            plaintext: 'hello world',
            sentAt: '2026-01-01T00:00:00.000Z',
            _formatted: { plaintext: 'hello <mark>world</mark>' },
          },
        ],
        estimatedTotalHits: 1,
      });

      const result = await service.searchMessages('u1', {
        q: 'world',
        limit: 20,
        offset: 0,
      });

      expect(result.hits[0]!.snippet).toBe('hello <mark>world</mark>');
      expect(result.hits[0]!.sentAt).toBeInstanceOf(Date);
    });

    it('filters by chatId when provided', async () => {
      mockMessageIndex.search.mockResolvedValue({ hits: [], estimatedTotalHits: 0 });

      await service.searchMessages('u1', {
        q: 'hello',
        chatId: 'chat-1',
        limit: 20,
        offset: 0,
      });

      expect(mockMessageIndex.search).toHaveBeenCalledWith(
        'hello',
        expect.objectContaining({ filter: 'chatId = "chat-1"' }),
      );
    });
  });

  describe('indexUser', () => {
    it('adds document to users index', async () => {
      await service.indexUser({ id: 'u1', phoneNumber: '+1', displayName: 'Alice', avatarKey: null });

      expect(mockUserIndex.addDocuments).toHaveBeenCalledWith([
        expect.objectContaining({ id: 'u1', displayName: 'Alice' }),
      ]);
    });
  });

  describe('indexMessage', () => {
    it('adds document to messages index', async () => {
      await service.indexMessage({
        id: 'msg-1',
        chatId: 'chat-1',
        senderId: 'u1',
        plaintext: 'hello',
        sentAt: '2026-01-01T00:00:00.000Z',
      });

      expect(mockMessageIndex.addDocuments).toHaveBeenCalled();
    });
  });

  describe('removeMessagesForChat', () => {
    it('deletes by chatId filter', async () => {
      await service.removeMessagesForChat('chat-1');

      expect(mockMessageIndex.deleteDocuments).toHaveBeenCalledWith({
        filter: 'chatId = "chat-1"',
      });
    });
  });
});
