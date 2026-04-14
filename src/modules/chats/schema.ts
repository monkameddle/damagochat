import { z } from 'zod';

export const CreateChatSchema = z.discriminatedUnion('type', [
  z.object({
    type: z.literal('DIRECT'),
    userId: z.string().uuid(), // the other participant
  }),
  z.object({
    type: z.literal('GROUP'),
    name: z.string().min(1).max(100),
    memberIds: z.array(z.string().uuid()).min(1).max(255),
  }),
]);

export const UpdateChatSchema = z.object({
  name: z.string().min(1).max(100).optional(),
  avatarKey: z.string().optional(),
});

export type CreateChatInput = z.infer<typeof CreateChatSchema>;
export type UpdateChatInput = z.infer<typeof UpdateChatSchema>;

export interface ChatSummary {
  id: string;
  type: 'DIRECT' | 'GROUP';
  name: string | null;
  avatarKey: string | null;
  createdAt: Date;
  members: ChatMemberSummary[];
}

export interface ChatMemberSummary {
  userId: string;
  role: 'MEMBER' | 'ADMIN';
  joinedAt: Date;
  user: {
    id: string;
    displayName: string;
    avatarKey: string | null;
    phoneNumber: string;
  };
}
