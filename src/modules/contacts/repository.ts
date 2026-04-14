import type { PrismaClient } from '@prisma/client';
import type { ContactEntry } from './schema.js';

const contactSelect = {
  userId: true,
  contactUserId: true,
  nickname: true,
  createdAt: true,
  contactUser: {
    select: {
      id: true,
      phoneNumber: true,
      displayName: true,
      avatarKey: true,
      about: true,
    },
  },
} as const;

function mapContact(raw: {
  userId: string;
  contactUserId: string;
  nickname: string | null;
  createdAt: Date;
  contactUser: {
    id: string;
    phoneNumber: string;
    displayName: string;
    avatarKey: string | null;
    about: string | null;
  };
}): ContactEntry {
  return {
    userId: raw.userId,
    contactUserId: raw.contactUserId,
    nickname: raw.nickname,
    createdAt: raw.createdAt,
    contact: raw.contactUser,
  };
}

export class ContactRepository {
  constructor(private readonly db: PrismaClient) {}

  async list(userId: string): Promise<ContactEntry[]> {
    const rows = await this.db.contact.findMany({
      where: { userId },
      select: contactSelect,
      orderBy: { createdAt: 'asc' },
    });
    return rows.map(mapContact);
  }

  async find(userId: string, contactUserId: string): Promise<ContactEntry | null> {
    const row = await this.db.contact.findUnique({
      where: { userId_contactUserId: { userId, contactUserId } },
      select: contactSelect,
    });
    return row ? mapContact(row) : null;
  }

  async create(data: {
    userId: string;
    contactUserId: string;
    nickname?: string;
  }): Promise<ContactEntry> {
    const row = await this.db.contact.create({
      data,
      select: contactSelect,
    });
    return mapContact(row);
  }

  async delete(userId: string, contactUserId: string): Promise<void> {
    await this.db.contact.deleteMany({
      where: { userId, contactUserId },
    });
  }
}
