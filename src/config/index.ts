import { z } from 'zod';

const envSchema = z.object({
  NODE_ENV: z.enum(['development', 'test', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  LOG_LEVEL: z.enum(['fatal', 'error', 'warn', 'info', 'debug', 'trace']).default('info'),

  DATABASE_URL: z.string().url(),

  REDIS_URL: z.string().url(),

  JWT_ACCESS_SECRET: z.string().min(64),
  JWT_REFRESH_SECRET: z.string().min(64),
  JWT_ACCESS_TTL: z.coerce.number().int().positive().default(900),
  JWT_REFRESH_TTL: z.coerce.number().int().positive().default(2592000),

  S3_ENDPOINT: z.string().url(),
  S3_BUCKET: z.string().min(1),
  S3_ACCESS_KEY: z.string().min(1),
  S3_SECRET_KEY: z.string().min(1),
  S3_REGION: z.string().default('us-east-1'),
  S3_FORCE_PATH_STYLE: z.string().transform(v => v !== 'false').default('true'),

  MEDIA_MAX_SIZE_MB: z.coerce.number().int().positive().default(64),

  FCM_PROJECT_ID: z.string().optional(),
  FCM_CLIENT_EMAIL: z.string().optional(),
  FCM_PRIVATE_KEY: z.string().optional(),
  ONESIGNAL_APP_ID: z.string().optional(),
  ONESIGNAL_API_KEY: z.string().optional(),
  NTFY_URL: z.string().url().optional(),
  NTFY_TOKEN: z.string().optional(),

  MEILISEARCH_URL: z.string().url(),
  MEILISEARCH_KEY: z.string().min(1),

  OTP_STUB: z.string().transform(v => v === 'true').default('false'),
  SEVEN_API_KEY: z.string().optional(),
  SEVEN_FROM: z.string().default('Damagochat'),
});

function loadConfig() {
  const result = envSchema.safeParse(process.env);
  if (!result.success) {
    const formatted = result.error.flatten().fieldErrors;
    throw new Error(`Invalid environment variables:\n${JSON.stringify(formatted, null, 2)}`);
  }
  return result.data;
}

export const config = loadConfig();
export type Config = typeof config;
