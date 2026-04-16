import type { PrismaClient, User, Session } from '@prisma/client';

export class AuthRepository {
  constructor(private readonly db: PrismaClient) {}

  async findUserByPhone(phoneNumber: string): Promise<User | null> {
    return this.db.user.findUnique({ where: { phoneNumber } });
  }

  async createUser(data: {
    phoneNumber: string;
  }): Promise<User> {
    return this.db.user.create({ data });
  }

  async createSession(data: {
    userId: string;
    deviceId: string;
    refreshToken: string;
    expiresAt: Date;
  }): Promise<Session> {
    return this.db.session.create({ data });
  }

  async findSession(refreshToken: string): Promise<Session | null> {
    return this.db.session.findUnique({ where: { refreshToken } });
  }

  async deleteSession(refreshToken: string): Promise<void> {
    await this.db.session.deleteMany({ where: { refreshToken } });
  }

  async deleteUserSessions(userId: string): Promise<void> {
    await this.db.session.deleteMany({ where: { userId } });
  }

  async rotateSession(
    oldRefreshToken: string,
    newData: { refreshToken: string; expiresAt: Date },
  ): Promise<Session | null> {
    const session = await this.db.session.findUnique({
      where: { refreshToken: oldRefreshToken },
    });
    if (!session) return null;

    return this.db.session.update({
      where: { id: session.id },
      data: newData,
    });
  }
}
