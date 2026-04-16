import type { FastifyInstance } from 'fastify';
import { config } from '../../config/index.js';
import {
  UnauthorizedError,
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

  async verify(input: {
    phoneNumber: string;
    otp: string;
    deviceId: string;
  }): Promise<TokenPair> {
    const valid = await verifyOtp(input.phoneNumber, input.otp);
    if (!valid) throw new ValidationError('Invalid or expired OTP');

    let user = await this.repo.findUserByPhone(input.phoneNumber);
    let isNewUser = false;

    if (!user) {
      user = await this.repo.createUser({ phoneNumber: input.phoneNumber });
      isNewUser = true;
    }

    return this.createTokenPair(user.id, input.deviceId, isNewUser);
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
      isNewUser: false,
    };
  }

  async logout(refreshToken: string): Promise<void> {
    await this.repo.deleteSession(refreshToken);
  }

  private async createTokenPair(userId: string, deviceId: string, isNewUser: boolean): Promise<TokenPair> {
    const accessToken = this.app.jwt.sign({ sub: userId, deviceId } as JwtPayload);

    const refreshToken = generateRefreshToken();
    const expiresAt = new Date(Date.now() + config.JWT_REFRESH_TTL * 1000);

    await this.repo.createSession({ userId, deviceId, refreshToken, expiresAt });

    return { accessToken, refreshToken, expiresIn: config.JWT_ACCESS_TTL, isNewUser };
  }
}
