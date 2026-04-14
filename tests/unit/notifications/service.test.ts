import { describe, it, expect, vi, beforeEach } from 'vitest';
import { NotificationService } from '../../../src/modules/notifications/service.js';
import type { NotificationRepository } from '../../../src/modules/notifications/repository.js';

vi.mock('../../../src/lib/queue.js', () => ({
  getQueue: vi.fn(() => ({
    addBulk: vi.fn().mockResolvedValue([]),
  })),
  QUEUES: { PUSH_NOTIFICATIONS: 'push-notifications' },
}));

vi.mock('../../../src/websocket/presence.js', () => ({
  isOnline: vi.fn(),
}));

import { isOnline } from '../../../src/websocket/presence.js';
import { getQueue } from '../../../src/lib/queue.js';

const mockRepo = {
  setToken: vi.fn(),
  clearToken: vi.fn(),
  getActiveTokens: vi.fn(),
  getTokensForUsers: vi.fn(),
} satisfies Partial<NotificationRepository> as unknown as NotificationRepository;

describe('NotificationService', () => {
  let service: NotificationService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new NotificationService(mockRepo);
  });

  describe('registerToken', () => {
    it('stores token via repository', async () => {
      mockRepo.setToken = vi.fn().mockResolvedValue(undefined);

      await service.registerToken('u1', 'dev-1', { token: 'fcm-token-123', platform: 'android' });

      expect(mockRepo.setToken).toHaveBeenCalledWith('u1', 'dev-1', 'fcm-token-123');
    });
  });

  describe('unregisterToken', () => {
    it('clears token via repository', async () => {
      mockRepo.clearToken = vi.fn().mockResolvedValue(undefined);

      await service.unregisterToken('u1', 'dev-1');

      expect(mockRepo.clearToken).toHaveBeenCalledWith('u1', 'dev-1');
    });
  });

  describe('notifyOfflineMembers', () => {
    it('enqueues push jobs for offline members only', async () => {
      vi.mocked(isOnline)
        .mockResolvedValueOnce(true)   // u2 online
        .mockResolvedValueOnce(false); // u3 offline

      mockRepo.getTokensForUsers = vi.fn().mockResolvedValue({
        u3: ['token-u3'],
      });

      await service.notifyOfflineMembers(
        ['u1', 'u2', 'u3'],
        'u1',
        { title: 'New message', body: 'Hello' },
      );

      expect(vi.mocked(getQueue)().addBulk).toHaveBeenCalledWith([
        expect.objectContaining({
          data: expect.objectContaining({ token: 'token-u3', userId: 'u3' }),
        }),
      ]);
    });

    it('skips sender', async () => {
      vi.mocked(isOnline).mockResolvedValue(false);
      mockRepo.getTokensForUsers = vi.fn().mockResolvedValue({});

      await service.notifyOfflineMembers(['u1'], 'u1', { title: 'x', body: 'y' });

      expect(mockRepo.getTokensForUsers).not.toHaveBeenCalled();
    });

    it('skips enqueue when all recipients online', async () => {
      vi.mocked(isOnline).mockResolvedValue(true);

      await service.notifyOfflineMembers(['u1', 'u2'], 'u1', { title: 'x', body: 'y' });

      expect(vi.mocked(getQueue)().addBulk).not.toHaveBeenCalled();
    });

    it('handles multiple tokens per user', async () => {
      vi.mocked(isOnline).mockResolvedValueOnce(false);
      mockRepo.getTokensForUsers = vi.fn().mockResolvedValue({
        u2: ['token-a', 'token-b'],
      });

      await service.notifyOfflineMembers(['u1', 'u2'], 'u1', { title: 'x', body: 'y' });

      const calls = vi.mocked(getQueue)().addBulk.mock.calls[0]![0]!;
      expect(calls).toHaveLength(2);
    });
  });
});
