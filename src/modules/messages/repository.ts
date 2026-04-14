import type { PrismaClient } from '@prisma/client';
import type { MessageRow, WsSendMessageInput } from './schema.js';

const messageSelect = {
  id: true,
  chatId: true,
  senderId: true,
  type: true,
  ciphertext: true,
  mediaKey: true,
  status: true,
  sentAt: true,
  deletedAt: true,
  reactions: { select: { id: true, userId: true, emoji: true } },
  media: {
    select: {
      id: true,
      s3Key: true,
      mimeType: true,
      sizeBytes: true,
      thumbnailKey: true,
    },
  },
} as const;

export class MessageRepository {
  constructor(private readonly db: PrismaClient) {}

  async listForChat(
    chatId: string,
    opts: { cursor?: string; limit: number },
  ): Promise<MessageRow[]> {
    const cursorClause = opts.cursor
      ? { sentAt: { lt: new Date(opts.cursor) } }
      : {};

    return this.db.message.findMany({
      where: { chatId, deletedAt: null, ...cursorClause },
      select: messageSelect,
      orderBy: { sentAt: 'desc' },
      take: opts.limit,
    }) as unknown as MessageRow[];
  }

  async findById(messageId: string): Promise<MessageRow | null> {
    return this.db.message.findUnique({
      where: { id: messageId },
      select: messageSelect,
    }) as unknown as MessageRow | null;
  }

  async create(data: {
    chatId: string;
    senderId: string;
    input: WsSendMessageInput;
  }): Promise<MessageRow> {
    return this.db.message.create({
      data: {
        chatId: data.chatId,
        senderId: data.senderId,
        type: data.input.type,
        ciphertext: data.input.ciphertext,
        mediaKey: data.input.mediaKey,
      },
      select: messageSelect,
    }) as unknown as MessageRow;
  }

  async softDelete(messageId: string): Promise<void> {
    await this.db.message.update({
      where: { id: messageId },
      data: { deletedAt: new Date() },
    });
  }

  async upsertReaction(
    messageId: string,
    userId: string,
    emoji: string,
  ): Promise<void> {
    await this.db.messageReaction.upsert({
      where: { messageId_userId: { messageId, userId } },
      update: { emoji },
      create: { messageId, userId, emoji },
    });
  }

  async removeReaction(messageId: string, userId: string): Promise<void> {
    await this.db.messageReaction.deleteMany({ where: { messageId, userId } });
  }

  async upsertStatus(
    messageId: string,
    userId: string,
    status: 'DELIVERED' | 'READ',
  ): Promise<void> {
    await this.db.messageStatus.upsert({
      where: { messageId_userId: { messageId, userId } },
      update: { status },
      create: { messageId, userId, status },
    });
  }
}
