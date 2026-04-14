import { z } from 'zod';

export const RegisterTokenSchema = z.object({
  token: z.string().min(10),
  platform: z.enum(['android', 'ios', 'web']),
});

export type RegisterTokenInput = z.infer<typeof RegisterTokenSchema>;

export interface PushPayload {
  title: string;
  body: string;
  data?: Record<string, string>;
}
