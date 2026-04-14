import type { FastifyInstance } from 'fastify';
import { getPrisma } from '../../lib/prisma.js';
import { ChatRepository } from './repository.js';
import { ChatService } from './service.js';
import { CreateChatSchema, UpdateChatSchema } from './schema.js';
import type { JwtPayload } from '../../shared/types.js';

export default async function chatsRouter(app: FastifyInstance) {
  const service = new ChatService(new ChatRepository(getPrisma()));

  app.addHook('preHandler', app.authenticate);

  // GET /api/v1/chats
  app.get('/', async (req) => {
    const { sub } = req.user as JwtPayload;
    return service.list(sub);
  });

  // POST /api/v1/chats
  app.post('/', async (req, reply) => {
    const { sub } = req.user as JwtPayload;
    const body = CreateChatSchema.parse(req.body);
    const chat = await service.create(sub, body);
    return reply.status(201).send(chat);
  });

  // GET /api/v1/chats/:chatId
  app.get('/:chatId', async (req) => {
    const { sub } = req.user as JwtPayload;
    const { chatId } = req.params as { chatId: string };
    return service.get(chatId, sub);
  });

  // PATCH /api/v1/chats/:chatId
  app.patch('/:chatId', async (req) => {
    const { sub } = req.user as JwtPayload;
    const { chatId } = req.params as { chatId: string };
    const body = UpdateChatSchema.parse(req.body);
    return service.update(chatId, sub, body);
  });

  // DELETE /api/v1/chats/:chatId/leave
  app.delete('/:chatId/leave', async (req, reply) => {
    const { sub } = req.user as JwtPayload;
    const { chatId } = req.params as { chatId: string };
    await service.leave(chatId, sub);
    return reply.status(204).send();
  });
}
