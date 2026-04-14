import type { FastifyInstance } from 'fastify';
import { SearchService } from './service.js';
import { UserSearchQuerySchema, MessageSearchQuerySchema } from './schema.js';
import type { JwtPayload } from '../../shared/types.js';

export default async function searchRouter(app: FastifyInstance) {
  const service = new SearchService();

  app.addHook('preHandler', app.authenticate);

  // GET /api/v1/search/users?q=&limit=&offset=
  app.get('/users', async (req) => {
    const query = UserSearchQuerySchema.parse(req.query);
    return service.searchUsers(query);
  });

  // GET /api/v1/search/messages?q=&chatId=&limit=&offset=
  app.get('/messages', async (req) => {
    const { sub } = req.user as JwtPayload;
    const query = MessageSearchQuerySchema.parse(req.query);
    return service.searchMessages(sub, query);
  });
}
