import type { PrismaClient } from '@prisma/client';
import type { ChatSummary, UpdateChatInput } from './schema.js';

const memberSelect = {
  userId: true,
  role: true,
  joinedAt: true,
  user: {
    select: {
      id: true,
      displayName: true,
      avatarKey: true,
      phoneNumber: true,
    },
  },
} as const;

const chatSelect = {
  id: true,
  type: true,
  name: true,
  avatarKey: true,
  createdAt: true,
  members: { select: memberSelect },
} as const;

export class ChatRepository {
  constructor(private readonly db: PrismaClient) {}

  async listForUser(userId: string): Promise<ChatSummary[]> {
    return this.db.chat.findMany({
      where: { members: { some: { userId } } },
      select: chatSelect,
      orderBy: { updatedAt: 'desc' },
    }) as unknown as ChatSummary[];
  }

  async findById(chatId: string): Promise<ChatSummary | null> {
    return this.db.chat.findUnique({
      where: { id: chatId },
      select: chatSelect,
    }) as unknown as ChatSummary | null;
  }

  async findDirectChat(
    userIdA: string,
    userIdB: string,
  ): Promise<ChatSummary | null> {
    const chat = await this.db.chat.findFirst({
      where: {
        type: 'DIRECT',
        members: {
          every: { userId: { in: [userIdA, userIdB] } },
        },
      },
      select: chatSelect,
    });
    // Verify exactly 2 members
    if (!chat) return null;
    const members = (chat as unknown as ChatSummary).members;
    if (members.length !== 2) return null;
    return chat as unknown as ChatSummary;
  }

  async createDirect(userIdA: string, userIdB: string): Promise<ChatSummary> {
    return this.db.chat.create({
      data: {
        type: 'DIRECT',
        members: {
          create: [
            { userId: userIdA, role: 'MEMBER' },
            { userId: userIdB, role: 'MEMBER' },
          ],
        },
      },
      select: chatSelect,
    }) as unknown as ChatSummary;
  }

  async createGroup(data: {
    name: string;
    creatorId: string;
    memberIds: string[];
  }): Promise<ChatSummary> {
    const allMembers = [data.creatorId, ...data.memberIds.filter((id) => id !== data.creatorId)];
    return this.db.chat.create({
      data: {
        type: 'GROUP',
        name: data.name,
        members: {
          create: allMembers.map((userId) => ({
            userId,
            role: userId === data.creatorId ? 'ADMIN' : 'MEMBER',
          })),
        },
      },
      select: chatSelect,
    }) as unknown as ChatSummary;
  }

  async update(chatId: string, data: UpdateChatInput): Promise<ChatSummary> {
    return this.db.chat.update({
      where: { id: chatId },
      data,
      select: chatSelect,
    }) as unknown as ChatSummary;
  }

  async isMember(chatId: string, userId: string): Promise<boolean> {
    const member = await this.db.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId } },
      select: { userId: true },
    });
    return member !== null;
  }

  async getMemberRole(
    chatId: string,
    userId: string,
  ): Promise<'MEMBER' | 'ADMIN' | null> {
    const member = await this.db.chatMember.findUnique({
      where: { chatId_userId: { chatId, userId } },
      select: { role: true },
    });
    return member?.role ?? null;
  }

  async removeMember(chatId: string, userId: string): Promise<void> {
    await this.db.chatMember.deleteMany({ where: { chatId, userId } });
  }

  async getChatMemberIds(chatId: string): Promise<string[]> {
    const members = await this.db.chatMember.findMany({
      where: { chatId },
      select: { userId: true },
    });
    return members.map((m) => m.userId);
  }
}
