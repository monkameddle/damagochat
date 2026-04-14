import type { FastifyInstance } from 'fastify';
import { getPrisma } from '../../lib/prisma.js';
import { AuthRepository } from './repository.js';
import { AuthService } from './service.js';
import {
  RegisterSchema,
  LoginSchema,
  RequestOtpSchema,
  RefreshSchema,
} from './schema.js';

export default async function authRouter(app: FastifyInstance) {
  const service = new AuthService(new AuthRepository(getPrisma()), app);

  // Rate limit auth endpoints aggressively
  const authRateLimit = {
    rateLimit: {
      max: 10,
      timeWindow: '1 minute',
      errorResponseBuilder: () => ({
        error: { code: 'TOO_MANY_REQUESTS', message: 'Too many requests' },
      }),
    },
  };

  // POST /api/v1/auth/otp  – request OTP (step 1 for both register + login)
  app.post('/otp', { config: authRateLimit }, async (req, reply) => {
    const body = RequestOtpSchema.parse(req.body);
    await service.requestOtp(body.phoneNumber);
    return reply.status(200).send({ message: 'OTP sent' });
  });

  // POST /api/v1/auth/register
  app.post('/register', { config: authRateLimit }, async (req, reply) => {
    const body = RegisterSchema.parse(req.body);
    const tokens = await service.register(body);
    return reply.status(201).send(tokens);
  });

  // POST /api/v1/auth/login
  app.post('/login', { config: authRateLimit }, async (req, reply) => {
    const body = LoginSchema.parse(req.body);
    const tokens = await service.login(body);
    return reply.status(200).send(tokens);
  });

  // POST /api/v1/auth/refresh
  app.post('/refresh', async (req, reply) => {
    const body = RefreshSchema.parse(req.body);
    const tokens = await service.refresh(body.refreshToken);
    return reply.status(200).send(tokens);
  });

  // POST /api/v1/auth/logout  (authenticated)
  app.post(
    '/logout',
    { preHandler: [app.authenticate] },
    async (req, reply) => {
      const body = RefreshSchema.parse(req.body);
      await service.logout(body.refreshToken);
      return reply.status(204).send();
    },
  );
}
