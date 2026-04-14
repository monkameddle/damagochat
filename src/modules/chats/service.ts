import { ForbiddenError, NotFoundError, ValidationError } from '../../shared/errors.js';
import type { ChatRepository } from './repository.js';
import type { ChatSummary, CreateChatInput, UpdateChatInput } from './schema.js';

export class ChatService {
  constructor(private readonly repo: ChatRepository) {}

  async list(userId: string): Promise<ChatSummary[]> {
    return this.repo.listForUser(userId);
  }

  async get(chatId: string, userId: string): Promise<ChatSummary> {
    const chat = await this.repo.findById(chatId);
    if (!chat) throw new NotFoundError('Chat', chatId);

    const isMember = await this.repo.isMember(chatId, userId);
    if (!isMember) throw new ForbiddenError('Not a member of this chat');

    return chat;
  }

  async create(userId: string, input: CreateChatInput): Promise<ChatSummary> {
    if (input.type === 'DIRECT') {
      if (input.userId === userId) {
        throw new ValidationError('Cannot create a chat with yourself');
      }
      // Idempotent: return existing direct chat if present
      const existing = await this.repo.findDirectChat(userId, input.userId);
      if (existing) return existing;

      return this.repo.createDirect(userId, input.userId);
    }

    return this.repo.createGroup({
      name: input.name,
      creatorId: userId,
      memberIds: input.memberIds,
    });
  }

  async update(
    chatId: string,
    userId: string,
    data: UpdateChatInput,
  ): Promise<ChatSummary> {
    const chat = await this.repo.findById(chatId);
    if (!chat) throw new NotFoundError('Chat', chatId);
    if (chat.type !== 'GROUP') throw new ValidationError('Only group chats can be updated');

    const role = await this.repo.getMemberRole(chatId, userId);
    if (role !== 'ADMIN') throw new ForbiddenError('Only admins can update group info');

    return this.repo.update(chatId, data);
  }

  async leave(chatId: string, userId: string): Promise<void> {
    const isMember = await this.repo.isMember(chatId, userId);
    if (!isMember) throw new ForbiddenError('Not a member of this chat');

    await this.repo.removeMember(chatId, userId);
  }
}
