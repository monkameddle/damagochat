import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockPipeline = {
  exists: vi.fn().mockReturnThis(),
  exec: vi.fn().mockResolvedValue([[null, 1], [null, 0]]),
};

const mockRedis = {
  set: vi.fn().mockResolvedValue('OK'),
  del: vi.fn().mockResolvedValue(1),
  expire: vi.fn().mockResolvedValue(1),
  exists: vi.fn().mockResolvedValue(1),
  pipeline: vi.fn().mockReturnValue(mockPipeline),
};

const mockPublisher = {
  publish: vi.fn().mockResolvedValue(1),
};

vi.mock('../../../src/lib/redis.js', () => ({
  getRedis: vi.fn(() => mockRedis),
  getPublisher: vi.fn(() => mockPublisher),
  presenceKey: (id: string) => `presence:${id}`,
  PRESENCE_TTL_SECONDS: 35,
}));

import {
  setOnline,
  setOffline,
  refreshPresence,
  isOnline,
  getPresence,
} from '../../../src/websocket/presence.js';

describe('presence', () => {
  beforeEach(() => vi.clearAllMocks());

  it('setOnline sets Redis key and publishes online event', async () => {
    await setOnline('u1');

    expect(mockRedis.set).toHaveBeenCalledWith('presence:u1', '1', 'EX', 35);
    expect(mockPublisher.publish).toHaveBeenCalledWith(
      'presence:u1',
      expect.stringContaining('"online":true'),
    );
  });

  it('setOffline deletes Redis key and publishes offline event', async () => {
    await setOffline('u1');

    expect(mockRedis.del).toHaveBeenCalledWith('presence:u1');
    expect(mockPublisher.publish).toHaveBeenCalledWith(
      'presence:u1',
      expect.stringContaining('"online":false'),
    );
  });

  it('refreshPresence extends TTL', async () => {
    await refreshPresence('u1');

    expect(mockRedis.expire).toHaveBeenCalledWith('presence:u1', 35);
  });

  it('isOnline returns true when key exists', async () => {
    mockRedis.exists.mockResolvedValueOnce(1);
    const result = await isOnline('u1');
    expect(result).toBe(true);
  });

  it('isOnline returns false when key missing', async () => {
    mockRedis.exists.mockResolvedValueOnce(0);
    const result = await isOnline('u1');
    expect(result).toBe(false);
  });

  it('getPresence returns map for multiple users', async () => {
    const result = await getPresence(['u1', 'u2']);

    expect(result).toEqual({ u1: true, u2: false });
  });

  it('getPresence returns empty object for empty input', async () => {
    const result = await getPresence([]);
    expect(result).toEqual({});
  });
});
