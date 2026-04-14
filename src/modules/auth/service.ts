import type { FastifyInstance } from 'fastify';
import { config } from '../../config/index.js';
import {
  UnauthorizedError,
  ConflictError,
  ValidationError,
} from '../../shared/errors.js';
import { AuthRepository } from './repository.js';
import {
  generateAndStoreOtp,
  sendOtp,
  verifyOtp,
  generateRefreshToken,
} from './otp.js';
import type { TokenPair } from './schema.js';
import type { JwtPayload } from '../../shared/types.js';

export class AuthService {
  constructor(
    private readonly repo: AuthRepository,
    private readonly app: FastifyInstance,
  ) {}

  async requestOtp(phoneNumber: string): Promise<void> {
    const otp = await generateAndStoreOtp(phoneNumber);
    this.app.log.info({ phoneNumber, otpStub: config.OTP_STUB }, 'OTP requested');
    if (config.NODE_ENV === 'development') {
      this.app.log.info({ phoneNumber, otp }, 'Dev OTP generated');
    }
    await sendOtp(phoneNumber, otp, this.app.log);
  }

  async register(input: {
    phoneNumber: string;
    displayName: string;
    otp: string;
    deviceId: string;
  }): Promise<TokenPair> {
    const valid = await verifyOtp(input.phoneNumber, input.otp);
    if (!valid) throw new ValidationError('Invalid or expired OTP');

    const existing = await this.repo.findUserByPhone(input.phoneNumber);
    if (existing) throw new ConflictError('Phone number already registered');

    const user = await this.repo.createUser({
      phoneNumber: input.phoneNumber,
      displayName: input.displayName,
    });

    return this.createTokenPair(user.id, input.deviceId);
  }

  async login(input: {
    phoneNumber: string;
    otp: string;
    deviceId: string;
  }): Promise<TokenPair> {
    const valid = await verifyOtp(input.phoneNumber, input.otp);
    if (!valid) throw new ValidationError('Invalid or expired OTP');

    const user = await this.repo.findUserByPhone(input.phoneNumber);
    if (!user) throw new UnauthorizedError('Phone number not registered');

    return this.createTokenPair(user.id, input.deviceId);
  }

  async refresh(refreshToken: string): Promise<TokenPair> {
    const session = await this.repo.findSession(refreshToken);
    if (!session || session.expiresAt < new Date()) {
      await this.repo.deleteSession(refreshToken);
      throw new UnauthorizedError('Refresh token invalid or expired');
    }

    const newRefreshToken = generateRefreshToken();
    const expiresAt = new Date(Date.now() + config.JWT_REFRESH_TTL * 1000);

    await this.repo.rotateSession(refreshToken, {
      refreshToken: newRefreshToken,
      expiresAt,
    });

    const accessToken = this.app.jwt.sign({
      sub: session.userId,
      deviceId: session.deviceId,
    } as JwtPayload);

    return {
      accessToken,
      refreshToken: newRefreshToken,
      expiresIn: config.JWT_ACCESS_TTL,
    };
  }

  async logout(refreshToken: string): Promise<void> {
    await this.repo.deleteSession(refreshToken);
  }

  private async createTokenPair(userId: string, deviceId: string): Promise<TokenPair> {
    const accessToken = this.app.jwt.sign({ sub: userId, deviceId } as JwtPayload);

    const refreshToken = generateRefreshToken();
    const expiresAt = new Date(Date.now() + config.JWT_REFRESH_TTL * 1000);

    await this.repo.createSession({ userId, deviceId, refreshToken, expiresAt });

    return { accessToken, refreshToken, expiresIn: config.JWT_ACCESS_TTL };
  }
}
