import { getPublisher } from '../../lib/redis.js';
import { getPrisma } from '../../lib/prisma.js';
import { MessageRepository } from '../../modules/messages/repository.js';
import { ChatRepository } from '../../modules/chats/repository.js';
import { MediaRepository } from '../../modules/media/repository.js';
import { MediaService } from '../../modules/media/service.js';
import { NotificationRepository } from '../../modules/notifications/repository.js';
import { NotificationService } from '../../modules/notifications/service.js';
import {
  WsSendMessageSchema,
  WsDeleteMessageSchema,
  WsReactMessageSchema,
} from '../../modules/messages/schema.js';
import { WsError } from '../../shared/errors.js';
import type { WsMessage } from '../../shared/types.js';

const msgRepo = new MessageRepository(getPrisma());
const chatRepo = new ChatRepository(getPrisma());
const mediaService = new MediaService(new MediaRepository(getPrisma()), chatRepo);
const notificationService = new NotificationService(new NotificationRepository(getPrisma()));

export async function handleMessageSend(
  userId: string,
  msg: WsMessage,
): Promise<void> {
  const input = WsSendMessageSchema.parse(msg.payload);

  const isMember = await chatRepo.isMember(input.chatId, userId);
  if (!isMember) throw new WsError('FORBIDDEN', 'Not a member of this chat');

  const message = await msgRepo.create({ chatId: input.chatId, senderId: userId, input });

  // Link pending media upload to the new message
  if (input.mediaId) {
    try {
      await mediaService.linkToMessage(input.mediaId, message.id);
    } catch (err) {
      // Non-fatal: message is sent, media linking failed (e.g. upload not done yet)
      process.stderr.write(`[message.send] media link failed: ${String(err)}\n`);
    }
  }

  await getPublisher().publish(
    `chat:${input.chatId}`,
    JSON.stringify({
      type: 'message.new',
      payload: message,
      chatId: input.chatId,
    }),
  );

  // Push notifications for offline members (fire-and-forget)
  const memberIds = await chatRepo.getChatMemberIds(input.chatId);
  notificationService
    .notifyOfflineMembers(memberIds, userId, {
      title: 'New message',
      body: message.type === 'TEXT' ? 'New message' : 'New media',
      data: { chatId: input.chatId, messageId: message.id },
    })
    .catch((err: unknown) => {
      process.stderr.write(`[message.send] push notify failed: ${String(err)}\n`);
    });
}

export async function handleMessageDelete(
  userId: string,
  msg: WsMessage,
): Promise<void> {
  const input = WsDeleteMessageSchema.parse(msg.payload);

  const message = await msgRepo.findById(input.messageId);
  if (!message || message.chatId !== input.chatId) {
    throw new WsError('NOT_FOUND', 'Message not found');
  }
  if (message.senderId !== userId) {
    throw new WsError('FORBIDDEN', 'Cannot delete another user\'s message');
  }

  await msgRepo.softDelete(input.messageId);

  await getPublisher().publish(
    `chat:${input.chatId}`,
    JSON.stringify({
      type: 'message.deleted',
      payload: { messageId: input.messageId, chatId: input.chatId },
      chatId: input.chatId,
    }),
  );
}

export async function handleMessageReact(
  userId: string,
  msg: WsMessage,
): Promise<void> {
  const input = WsReactMessageSchema.parse(msg.payload);

  const isMember = await chatRepo.isMember(input.chatId, userId);
  if (!isMember) throw new WsError('FORBIDDEN', 'Not a member of this chat');

  // Empty emoji = remove reaction
  if (input.emoji === '') {
    await msgRepo.removeReaction(input.messageId, userId);
  } else {
    await msgRepo.upsertReaction(input.messageId, userId, input.emoji);
  }

  await getPublisher().publish(
    `chat:${input.chatId}`,
    JSON.stringify({
      type: 'message.reaction',
      payload: { messageId: input.messageId, userId, emoji: input.emoji, chatId: input.chatId },
      chatId: input.chatId,
    }),
  );
}
