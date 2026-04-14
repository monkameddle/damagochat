import type { PrismaClient } from '@prisma/client';

export class MediaRepository {
  constructor(private readonly db: PrismaClient) {}

  async create(data: {
    id: string;
    messageId: string;
    s3Key: string;
    mimeType: string;
    sizeBytes: number;
  }) {
    return this.db.mediaObject.create({ data });
  }

  async findById(id: string) {
    return this.db.mediaObject.findUnique({ where: { id } });
  }

  async findByMessageId(messageId: string) {
    return this.db.mediaObject.findUnique({ where: { messageId } });
  }

  async updateThumbnail(id: string, thumbnailKey: string): Promise<void> {
    await this.db.mediaObject.update({
      where: { id },
      data: { thumbnailKey },
    });
  }
}
