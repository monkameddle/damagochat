import { z } from 'zod';
import type { FastifyInstance } from 'fastify';
import { getPrisma } from '../../lib/prisma.js';
import { EncryptionRepository } from './repository.js';
import { EncryptionService } from './service.js';
import { UploadKeyBundleSchema } from './schema.js';
import type { JwtPayload } from '../../shared/types.js';

const ReplenishSchema = z.object({
  preKeys: z
    .array(
      z.object({
        keyId: z.number().int().nonnegative(),
        publicKey: z.string().min(40),
      }),
    )
    .min(1)
    .max(100),
});

export default async function encryptionRouter(app: FastifyInstance) {
  const service = new EncryptionService(new EncryptionRepository(getPrisma()));

  app.addHook('preHandler', app.authenticate);

  // POST /api/v1/encryption/keys  — upload / replace full bundle
  app.post('/keys', async (req, reply) => {
    const { sub } = req.user as JwtPayload;
    const body = UploadKeyBundleSchema.parse(req.body);
    await service.uploadBundle(sub, body);
    return reply.status(201).send({ message: 'PreKeyBundle uploaded' });
  });

  // GET /api/v1/encryption/keys/:userId — fetch bundle + consume one OTP pre-key
  app.get('/keys/:userId', async (req) => {
    const { sub } = req.user as JwtPayload;
    const { userId } = req.params as { userId: string };
    return service.fetchBundle(sub, userId);
  });

  // POST /api/v1/encryption/keys/replenish — add more one-time pre-keys
  app.post('/keys/replenish', async (req, reply) => {
    const { sub } = req.user as JwtPayload;
    const body = ReplenishSchema.parse(req.body);
    await service.replenishPreKeys(sub, body.preKeys);
    return reply.status(200).send({ message: 'Pre-keys added' });
  });

  // GET /api/v1/encryption/keys/count — how many OTP pre-keys remain
  app.get('/keys/count', async (req) => {
    const { sub } = req.user as JwtPayload;
    const count = await service.getPreKeyCount(sub);
    return { count };
  });
}
