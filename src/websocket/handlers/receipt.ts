import { getPublisher } from '../../lib/redis.js';
import { getPrisma } from '../../lib/prisma.js';
import { MessageRepository } from '../../modules/messages/repository.js';
import { WsReceiptSchema } from '../../modules/messages/schema.js';
import { WsError } from '../../shared/errors.js';
import type { WsMessage } from '../../shared/types.js';

const msgRepo = new MessageRepository(getPrisma());

async function handleReceipt(
  userId: string,
  msg: WsMessage,
  status: 'DELIVERED' | 'READ',
): Promise<void> {
  const input = WsReceiptSchema.parse(msg.payload);

  const message = await msgRepo.findById(input.messageId);
  if (!message || message.chatId !== input.chatId) {
    throw new WsError('NOT_FOUND', 'Message not found');
  }
  if (message.senderId === userId) return; // no self-receipts

  await msgRepo.upsertStatus(input.messageId, userId, status);

  await getPublisher().publish(
    `chat:${input.chatId}`,
    JSON.stringify({
      type: 'receipt.update',
      payload: {
        messageId: input.messageId,
        userId,
        status,
        chatId: input.chatId,
      },
      chatId: input.chatId,
    }),
  );
}

export async function handleReceiptDelivered(
  userId: string,
  msg: WsMessage,
): Promise<void> {
  return handleReceipt(userId, msg, 'DELIVERED');
}

export async function handleReceiptRead(
  userId: string,
  msg: WsMessage,
): Promise<void> {
  return handleReceipt(userId, msg, 'READ');
}
