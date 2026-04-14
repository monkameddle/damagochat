import { ForbiddenError, NotFoundError } from '../../shared/errors.js';
import type { ChatRepository } from '../chats/repository.js';
import type { MessageRepository } from './repository.js';
import type { MessageCursorInput, MessageRow } from './schema.js';

export class MessageService {
  constructor(
    private readonly msgRepo: MessageRepository,
    private readonly chatRepo: ChatRepository,
  ) {}

  async list(
    chatId: string,
    userId: string,
    opts: MessageCursorInput,
  ): Promise<{ items: MessageRow[]; nextCursor?: string }> {
    const isMember = await this.chatRepo.isMember(chatId, userId);
    if (!isMember) throw new ForbiddenError('Not a member of this chat');

    const items = await this.msgRepo.listForChat(chatId, {
      limit: opts.limit,
      ...(opts.cursor !== undefined && { cursor: opts.cursor }),
    });
    const nextCursor =
      items.length === opts.limit
        ? items[items.length - 1]!.sentAt.toISOString()
        : undefined;

    return {
      items,
      ...(nextCursor !== undefined && { nextCursor }),
    };
  }

  async getOne(
    chatId: string,
    messageId: string,
    userId: string,
  ): Promise<MessageRow> {
    const isMember = await this.chatRepo.isMember(chatId, userId);
    if (!isMember) throw new ForbiddenError('Not a member of this chat');

    const msg = await this.msgRepo.findById(messageId);
    if (!msg || msg.chatId !== chatId) throw new NotFoundError('Message', messageId);

    return msg;
  }
}
