import { describe, it, expect, vi, beforeEach } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { AuthService } from '../../../src/modules/auth/service.js';
import type { AuthRepository } from '../../../src/modules/auth/repository.js';
import * as otpModule from '../../../src/modules/auth/otp.js';
import { ValidationError, UnauthorizedError, ConflictError } from '../../../src/shared/errors.js';

// Mock config so OTP_STUB=true
vi.mock('../../../src/config/index.js', () => ({
  config: {
    NODE_ENV: 'test',
    JWT_ACCESS_TTL: 900,
    JWT_REFRESH_TTL: 2592000,
    OTP_STUB: true,
  },
}));

vi.mock('../../../src/modules/auth/otp.js', () => ({
  generateAndStoreOtp: vi.fn().mockResolvedValue('123456'),
  verifyOtp: vi.fn().mockResolvedValue(true),
  generateRefreshToken: vi.fn().mockReturnValue('mock-refresh-token'),
}));

const mockRepo = {
  findUserByPhone: vi.fn(),
  createUser: vi.fn(),
  createSession: vi.fn(),
  findSession: vi.fn(),
  deleteSession: vi.fn(),
  deleteUserSessions: vi.fn(),
  rotateSession: vi.fn(),
} satisfies Partial<AuthRepository> as unknown as AuthRepository;

const mockApp = {
  log: { info: vi.fn() },
  jwt: { sign: vi.fn().mockReturnValue('mock-access-token') },
} as unknown as FastifyInstance;

describe('AuthService', () => {
  let service: AuthService;

  beforeEach(() => {
    vi.clearAllMocks();
    service = new AuthService(mockRepo, mockApp);
  });

  describe('register', () => {
    it('creates user and returns tokens on valid OTP', async () => {
      mockRepo.findUserByPhone = vi.fn().mockResolvedValue(null);
      mockRepo.createUser = vi.fn().mockResolvedValue({ id: 'user-1' });
      mockRepo.createSession = vi.fn().mockResolvedValue({});

      const result = await service.register({
        phoneNumber: '+1234567890',
        displayName: 'Alice',
        otp: '123456',
        deviceId: 'device-1',
      });

      expect(result.accessToken).toBe('mock-access-token');
      expect(result.refreshToken).toBe('mock-refresh-token');
      expect(mockRepo.createUser).toHaveBeenCalledWith({
        phoneNumber: '+1234567890',
        displayName: 'Alice',
      });
    });

    it('throws ConflictError if phone already registered', async () => {
      mockRepo.findUserByPhone = vi.fn().mockResolvedValue({ id: 'existing' });

      await expect(
        service.register({
          phoneNumber: '+1234567890',
          displayName: 'Alice',
          otp: '123456',
          deviceId: 'device-1',
        }),
      ).rejects.toThrow(ConflictError);
    });

    it('throws ValidationError on invalid OTP', async () => {
      vi.mocked(otpModule.verifyOtp).mockResolvedValueOnce(false);

      await expect(
        service.register({
          phoneNumber: '+1234567890',
          displayName: 'Alice',
          otp: '000000',
          deviceId: 'device-1',
        }),
      ).rejects.toThrow(ValidationError);
    });
  });

  describe('login', () => {
    it('returns tokens for registered user', async () => {
      mockRepo.findUserByPhone = vi.fn().mockResolvedValue({ id: 'user-1' });
      mockRepo.createSession = vi.fn().mockResolvedValue({});

      const result = await service.login({
        phoneNumber: '+1234567890',
        otp: '123456',
        deviceId: 'device-1',
      });

      expect(result.accessToken).toBe('mock-access-token');
    });

    it('throws UnauthorizedError for unregistered phone', async () => {
      mockRepo.findUserByPhone = vi.fn().mockResolvedValue(null);

      await expect(
        service.login({
          phoneNumber: '+9999999999',
          otp: '123456',
          deviceId: 'device-1',
        }),
      ).rejects.toThrow(UnauthorizedError);
    });
  });

  describe('refresh', () => {
    it('rotates session and returns new tokens', async () => {
      const future = new Date(Date.now() + 1000000);
      mockRepo.findSession = vi.fn().mockResolvedValue({
        userId: 'user-1',
        deviceId: 'device-1',
        expiresAt: future,
      });
      mockRepo.rotateSession = vi.fn().mockResolvedValue({});

      const result = await service.refresh('old-refresh-token');

      expect(result.accessToken).toBe('mock-access-token');
      expect(mockRepo.rotateSession).toHaveBeenCalled();
    });

    it('throws UnauthorizedError for expired session', async () => {
      mockRepo.findSession = vi.fn().mockResolvedValue({
        userId: 'user-1',
        deviceId: 'device-1',
        expiresAt: new Date(Date.now() - 1000),
      });
      mockRepo.deleteSession = vi.fn().mockResolvedValue(undefined);

      await expect(service.refresh('expired-token')).rejects.toThrow(UnauthorizedError);
    });

    it('throws UnauthorizedError for unknown token', async () => {
      mockRepo.findSession = vi.fn().mockResolvedValue(null);
      mockRepo.deleteSession = vi.fn().mockResolvedValue(undefined);

      await expect(service.refresh('unknown-token')).rejects.toThrow(UnauthorizedError);
    });
  });

  describe('logout', () => {
    it('deletes session', async () => {
      mockRepo.deleteSession = vi.fn().mockResolvedValue(undefined);

      await service.logout('some-token');

      expect(mockRepo.deleteSession).toHaveBeenCalledWith('some-token');
    });
  });
});
