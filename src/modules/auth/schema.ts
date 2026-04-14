import { z } from 'zod';

export const RegisterSchema = z.object({
  phoneNumber: z
    .string()
    .regex(/^\+[1-9]\d{6,14}$/, 'Phone number must be in E.164 format'),
  displayName: z.string().min(1).max(100),
  otp: z.string().length(6).regex(/^\d{6}$/, 'OTP must be 6 digits'),
  deviceId: z.string().uuid(),
});

export const LoginSchema = z.object({
  phoneNumber: z
    .string()
    .regex(/^\+[1-9]\d{6,14}$/, 'Phone number must be in E.164 format'),
  otp: z.string().length(6).regex(/^\d{6}$/, 'OTP must be 6 digits'),
  deviceId: z.string().uuid(),
});

export const RequestOtpSchema = z.object({
  phoneNumber: z
    .string()
    .regex(/^\+[1-9]\d{6,14}$/, 'Phone number must be in E.164 format'),
});

export const RefreshSchema = z.object({
  refreshToken: z.string().min(1),
});

export type RegisterInput = z.infer<typeof RegisterSchema>;
export type LoginInput = z.infer<typeof LoginSchema>;
export type RequestOtpInput = z.infer<typeof RequestOtpSchema>;
export type RefreshInput = z.infer<typeof RefreshSchema>;

export interface TokenPair {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}
