import { z } from 'zod';

export const RequestOtpSchema = z.object({
  phoneNumber: z
    .string()
    .regex(/^\+[1-9]\d{6,14}$/, 'Phone number must be in E.164 format'),
});

export const VerifyOtpSchema = z.object({
  phoneNumber: z
    .string()
    .regex(/^\+[1-9]\d{6,14}$/, 'Phone number must be in E.164 format'),
  otp: z.string().length(6).regex(/^\d{6}$/, 'OTP must be 6 digits'),
  deviceId: z.string().uuid(),
});

export const RefreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export type RequestOtpInput = z.infer<typeof RequestOtpSchema>;
export type VerifyOtpInput = z.infer<typeof VerifyOtpSchema>;
export type RefreshInput = z.infer<typeof RefreshSchema>;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
  isNewUser: boolean;
}
