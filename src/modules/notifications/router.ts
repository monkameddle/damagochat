import type { FastifyInstance } from 'fastify';
import { getPrisma } from '../../lib/prisma.js';
import { NotificationRepository } from './repository.js';
import { NotificationService } from './service.js';
import { RegisterTokenSchema } from './schema.js';
import type { JwtPayload } from '../../shared/types.js';

export default async function notificationsRouter(app: FastifyInstance) {
  const service = new NotificationService(new NotificationRepository(getPrisma()));

  app.addHook('preHandler', app.authenticate);

  // POST /api/v1/notifications/token  — register FCM/APNs token
  app.post('/token', async (req, reply) => {
    const { sub, deviceId } = req.user as JwtPayload;
    const body = RegisterTokenSchema.parse(req.body);
    await service.registerToken(sub, deviceId, body);
    return reply.status(204).send();
  });

  // DELETE /api/v1/notifications/token  — unregister on logout/permission revoked
  app.delete('/token', async (req, reply) => {
    const { sub, deviceId } = req.user as JwtPayload;
    await service.unregisterToken(sub, deviceId);
    return reply.status(204).send();
  });
}
