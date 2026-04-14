import type { FastifyInstance, FastifyPluginAsync } from 'fastify';
import { getPrisma } from '../../lib/prisma.js';
import { MediaRepository } from './repository.js';
import { MediaService } from './service.js';
import { ChatRepository } from '../chats/repository.js';
import { PrepareUploadSchema } from './schema.js';
import type { JwtPayload } from '../../shared/types.js';

const mediaRouter: FastifyPluginAsync = async function mediaRouter(app: FastifyInstance) {
  const service = new MediaService(
    new MediaRepository(getPrisma()),
    new ChatRepository(getPrisma()),
  );

  app.addHook('preHandler', app.authenticate);

  // POST /api/v1/media/prepare
  app.post('/prepare', async (req, reply) => {
    const { sub } = req.user as JwtPayload;
    const body = PrepareUploadSchema.parse(req.body);
    const result = await service.prepareUpload(sub, body);
    return reply.status(201).send(result);
  });

  // GET /api/v1/media/:mediaId?chatId=...
  app.get('/:mediaId', async (req) => {
    const { sub } = req.user as JwtPayload;
    const { mediaId } = req.params as { mediaId: string };
    const { chatId } = req.query as { chatId: string };
    return service.getMedia(mediaId, sub, chatId);
  });
};

export default mediaRouter;
