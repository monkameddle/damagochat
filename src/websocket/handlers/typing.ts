import { getPublisher } from '../../lib/redis.js';
import { z } from 'zod';
import { WsError } from '../../shared/errors.js';
import { getPrisma } from '../../lib/prisma.js';
import { ChatRepository } from '../../modules/chats/repository.js';
import type { WsMessage } from '../../shared/types.js';

const TypingSchema = z.object({ chatId: z.string().uuid() });

const chatRepo = new ChatRepository(getPrisma());

async function handleTyping(
  userId: string,
  msg: WsMessage,
  typing: boolean,
): Promise<void> {
  const { chatId } = TypingSchema.parse(msg.payload);

  const isMember = await chatRepo.isMember(chatId, userId);
  if (!isMember) throw new WsError('FORBIDDEN', 'Not a member of this chat');

  await getPublisher().publish(
    `chat:${chatId}`,
    JSON.stringify({
      type: 'typing',
      payload: { chatId, userId, typing },
      chatId,
    }),
  );
}

export async function handleTypingStart(
  userId: string,
  msg: WsMessage,
): Promise<void> {
  return handleTyping(userId, msg, true);
}

export async function handleTypingStop(
  userId: string,
  msg: WsMessage,
): Promise<void> {
  return handleTyping(userId, msg, false);
}
