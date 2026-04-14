import { z } from 'zod';

export const AddContactSchema = z.object({
  phoneNumber: z
    .string()
    .regex(/^\+[1-9]\d{6,14}$/, 'Phone number must be in E.164 format'),
  nickname: z.string().max(100).optional(),
});

export type AddContactInput = z.infer<typeof AddContactSchema>;

export interface ContactEntry {
  userId: string;
  contactUserId: string;
  nickname: string | null;
  createdAt: Date;
  contact: {
    id: string;
    phoneNumber: string;
    displayName: string;
    avatarKey: string | null;
    about: string | null;
  };
}
