import { z } from 'zod';

const Base64Key = z
  .string()
  .min(40, 'Key too short')
  .regex(/^[A-Za-z0-9+/]+=*$/, 'Must be base64');

const SignedPreKeySchema = z.object({
  keyId: z.number().int().nonnegative(),
  publicKey: Base64Key,
  signature: Base64Key,
});

const PreKeySchema = z.object({
  keyId: z.number().int().nonnegative(),
  publicKey: Base64Key,
});

export const UploadKeyBundleSchema = z.object({
  deviceId: z.string().uuid(),
  identityKey: Base64Key,
  signedPreKey: SignedPreKeySchema,
  preKeys: z.array(PreKeySchema).min(1).max(100),
});

export type UploadKeyBundleInput = z.infer<typeof UploadKeyBundleSchema>;

export interface PreKeyBundleResponse {
  userId: string;
  deviceId: string;
  identityKey: string;
  signedPreKey: {
    keyId: number;
    publicKey: string;
    signature: string;
  };
  preKey: {
    keyId: number;
    publicKey: string;
  } | null; // null when all one-time pre-keys exhausted
}
