import type { PrismaClient } from '@prisma/client';

export class NotificationRepository {
  constructor(private readonly db: PrismaClient) {}

  async setToken(userId: string, deviceId: string, token: string): Promise<void> {
    await this.db.session.updateMany({
      where: { userId, deviceId },
      data: { fcmToken: token },
    });
  }

  async clearToken(userId: string, deviceId: string): Promise<void> {
    await this.db.session.updateMany({
      where: { userId, deviceId },
      data: { fcmToken: null },
    });
  }

  async getActiveTokens(userId: string): Promise<string[]> {
    const sessions = await this.db.session.findMany({
      where: {
        userId,
        expiresAt: { gt: new Date() },
        fcmToken: { not: null },
      },
      select: { fcmToken: true },
    });
    return sessions.map((s) => s.fcmToken!);
  }

  async getTokensForUsers(userIds: string[]): Promise<Record<string, string[]>> {
    const sessions = await this.db.session.findMany({
      where: {
        userId: { in: userIds },
        expiresAt: { gt: new Date() },
        fcmToken: { not: null },
      },
      select: { userId: true, fcmToken: true },
    });

    const result: Record<string, string[]> = {};
    for (const s of sessions) {
      if (!result[s.userId]) result[s.userId] = [];
      result[s.userId]!.push(s.fcmToken!);
    }
    return result;
  }
}
