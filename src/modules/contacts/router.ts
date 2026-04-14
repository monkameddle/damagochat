import type { FastifyInstance } from 'fastify';
import { getPrisma } from '../../lib/prisma.js';
import { ContactRepository } from './repository.js';
import { ContactService } from './service.js';
import { AddContactSchema } from './schema.js';
import { UserRepository } from '../users/repository.js';
import type { JwtPayload } from '../../shared/types.js';

export default async function contactsRouter(app: FastifyInstance) {
  const service = new ContactService(
    new ContactRepository(getPrisma()),
    new UserRepository(getPrisma()),
  );

  app.addHook('preHandler', app.authenticate);

  // GET /api/v1/contacts
  app.get('/', async (req) => {
    const { sub } = req.user as JwtPayload;
    return service.list(sub);
  });

  // POST /api/v1/contacts
  app.post('/', async (req, reply) => {
    const { sub } = req.user as JwtPayload;
    const body = AddContactSchema.parse(req.body);
    const contact = await service.add(sub, body);
    return reply.status(201).send(contact);
  });

  // DELETE /api/v1/contacts/:contactId
  app.delete('/:contactId', async (req, reply) => {
    const { sub } = req.user as JwtPayload;
    const { contactId } = req.params as { contactId: string };
    await service.remove(sub, contactId);
    return reply.status(204).send();
  });
}
