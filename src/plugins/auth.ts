import type { FastifyInstance, FastifyRequest, FastifyReply } from 'fastify';
import fp from 'fastify-plugin';
import fastifyJwt from '@fastify/jwt';
import { config } from '../config/index.js';
import { UnauthorizedError } from '../shared/errors.js';
import type { JwtPayload } from '../shared/types.js';

declare module '@fastify/jwt' {
  interface FastifyJWT {
    payload: JwtPayload;
    user: JwtPayload;
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    authenticate: (req: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

export default fp(async function authPlugin(app: FastifyInstance) {
  await app.register(fastifyJwt, {
    secret: config.JWT_ACCESS_SECRET,
    sign: { expiresIn: config.JWT_ACCESS_TTL },
  });

  app.decorate('authenticate', async function (req: FastifyRequest, _reply: FastifyReply) {
    try {
      await req.jwtVerify();
    } catch {
      throw new UnauthorizedError('Invalid or expired token');
    }
  });
});
