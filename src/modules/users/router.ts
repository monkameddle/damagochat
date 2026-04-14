import type { FastifyInstance } from 'fastify';
import { getPrisma } from '../../lib/prisma.js';
import { UserRepository } from './repository.js';
import { UserService } from './service.js';
import { UpdateMeSchema, UserSearchSchema } from './schema.js';
import type { JwtPayload } from '../../shared/types.js';

export default async function usersRouter(app: FastifyInstance) {
  const service = new UserService(new UserRepository(getPrisma()));

  app.addHook('preHandler', app.authenticate);

  // GET /api/v1/users/me
  app.get('/me', async (req) => {
    const { sub } = req.user as JwtPayload;
    return service.getMe(sub);
  });

  // PATCH /api/v1/users/me
  app.patch('/me', async (req) => {
    const { sub } = req.user as JwtPayload;
    const body = UpdateMeSchema.parse(req.body);
    return service.updateMe(sub, body);
  });

  // GET /api/v1/users/search?q=
  app.get('/search', async (req) => {
    const { q } = UserSearchSchema.parse(req.query);
    return service.searchUsers(q);
  });
}
