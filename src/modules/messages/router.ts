import type { FastifyInstance } from 'fastify';
import { getPrisma } from '../../lib/prisma.js';
import { MessageRepository } from './repository.js';
import { MessageService } from './service.js';
import { ChatRepository } from '../chats/repository.js';
import { MessageCursorSchema } from './schema.js';
import type { JwtPayload } from '../../shared/types.js';

export default async function messagesRouter(app: FastifyInstance) {
  const service = new MessageService(
    new MessageRepository(getPrisma()),
    new ChatRepository(getPrisma()),
  );

  app.addHook('preHandler', app.authenticate);

  // GET /api/v1/chats/:chatId/messages
  app.get('/:chatId/messages', async (req) => {
    const { sub } = req.user as JwtPayload;
    const { chatId } = req.params as { chatId: string };
    const query = MessageCursorSchema.parse(req.query);
    return service.list(chatId, sub, query);
  });

  // GET /api/v1/chats/:chatId/messages/:messageId
  app.get('/:chatId/messages/:messageId', async (req) => {
    const { sub } = req.user as JwtPayload;
    const { chatId, messageId } = req.params as {
      chatId: string;
      messageId: string;
    };
    return service.getOne(chatId, messageId, sub);
  });
}
