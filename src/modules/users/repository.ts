import type { PrismaClient } from '@prisma/client';
import type { UpdateMeInput, UserProfile } from './schema.js';

export class UserRepository {
  constructor(private readonly db: PrismaClient) {}

  async findById(id: string): Promise<UserProfile | null> {
    return this.db.user.findUnique({
      where: { id },
      select: {
        id: true,
        phoneNumber: true,
        displayName: true,
        avatarKey: true,
        about: true,
        createdAt: true,
      },
    });
  }

  async findByPhone(phoneNumber: string): Promise<UserProfile | null> {
    return this.db.user.findUnique({
      where: { phoneNumber },
      select: {
        id: true,
        phoneNumber: true,
        displayName: true,
        avatarKey: true,
        about: true,
        createdAt: true,
      },
    });
  }

  async updateMe(id: string, data: UpdateMeInput): Promise<UserProfile> {
    const updateData: { displayName?: string; about?: string; avatarKey?: string } = {};
    if (data.displayName !== undefined) updateData.displayName = data.displayName;
    if (data.about !== undefined) updateData.about = data.about;
    if (data.avatarKey !== undefined) updateData.avatarKey = data.avatarKey;
    return this.db.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        phoneNumber: true,
        displayName: true,
        avatarKey: true,
        about: true,
        createdAt: true,
      },
    });
  }

  async findManyByIds(ids: string[]): Promise<UserProfile[]> {
    return this.db.user.findMany({
      where: { id: { in: ids } },
      select: {
        id: true,
        phoneNumber: true,
        displayName: true,
        avatarKey: true,
        about: true,
        createdAt: true,
      },
    });
  }
}
