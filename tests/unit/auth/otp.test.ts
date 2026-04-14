import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('../../../src/config/index.js', () => ({
  config: { OTP_STUB: false },
}));

vi.mock('../../../src/lib/redis.js', () => ({
  getRedis: vi.fn(() => ({
    set: vi.fn().mockResolvedValue('OK'),
    get: vi.fn(),
    del: vi.fn().mockResolvedValue(1),
  })),
}));

import { generateAndStoreOtp, verifyOtp } from '../../../src/modules/auth/otp.js';
import { getRedis } from '../../../src/lib/redis.js';
import { createHash } from 'crypto';

function hash(otp: string) {
  return createHash('sha256').update(otp).digest('hex');
}

describe('OTP', () => {
  let mockRedis: ReturnType<typeof getRedis>;

  beforeEach(() => {
    mockRedis = getRedis();
    vi.clearAllMocks();
  });

  it('generateAndStoreOtp stores hashed OTP', async () => {
    const otp = await generateAndStoreOtp('+1234567890');

    expect(otp).toMatch(/^\d{6}$/);
    expect(mockRedis.set).toHaveBeenCalledWith(
      'otp:+1234567890',
      hash(otp),
      'EX',
      300,
    );
  });

  it('verifyOtp returns true for correct OTP', async () => {
    const otp = '654321';
    vi.mocked(mockRedis.get).mockResolvedValue(hash(otp));

    const result = await verifyOtp('+1234567890', otp);

    expect(result).toBe(true);
    expect(mockRedis.del).toHaveBeenCalled();
  });

  it('verifyOtp returns false for wrong OTP', async () => {
    vi.mocked(mockRedis.get).mockResolvedValue(hash('999999'));

    const result = await verifyOtp('+1234567890', '000000');

    expect(result).toBe(false);
    expect(mockRedis.del).not.toHaveBeenCalled();
  });

  it('verifyOtp returns false when key expired', async () => {
    vi.mocked(mockRedis.get).mockResolvedValue(null);

    const result = await verifyOtp('+1234567890', '123456');

    expect(result).toBe(false);
  });
});
