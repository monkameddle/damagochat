import { z } from 'zod';

export const UpdateMeSchema = z.object({
  displayName: z.string().min(1).max(100).optional(),
  about: z.string().max(500).optional(),
  avatarKey: z.string().optional(),
});

export const UserSearchSchema = z.object({
  q: z.string().min(1).max(100),
});

export type UpdateMeInput = z.infer<typeof UpdateMeSchema>;

export interface UserProfile {
  id: string;
  phoneNumber: string;
  displayName: string | null;
  avatarKey: string | null;
  about: string | null;
  createdAt: Date;
}
