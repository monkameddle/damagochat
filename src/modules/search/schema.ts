import { z } from 'zod';

export const UserSearchQuerySchema = z.object({
  q: z.string().min(1).max(100),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export const MessageSearchQuerySchema = z.object({
  q: z.string().min(1).max(200),
  chatId: z.string().uuid().optional(),
  limit: z.coerce.number().int().min(1).max(50).default(20),
  offset: z.coerce.number().int().min(0).default(0),
});

export type UserSearchQuery = z.infer<typeof UserSearchQuerySchema>;
export type MessageSearchQuery = z.infer<typeof MessageSearchQuerySchema>;

export interface UserSearchResult {
  id: string;
  phoneNumber: string;
  displayName: string | null;
  avatarKey: string | null;
}

export interface MessageSearchResult {
  id: string;
  chatId: string;
  senderId: string;
  sentAt: Date;
  snippet: string; // highlighted excerpt from Meilisearch
}

export interface SearchResponse<T> {
  hits: T[];
  total: number;
  offset: number;
  limit: number;
}

// Shape stored in Meilisearch user index
export interface UserIndexDoc {
  id: string;
  phoneNumber: string;
  displayName: string | null;
  avatarKey: string | null;
}

// Shape stored in Meilisearch message index
// NOTE: only stores plaintext metadata — E2E messages have no server-side plaintext.
// This index is for non-E2E chats or for indexing by the sender's own client push.
export interface MessageIndexDoc {
  id: string;
  chatId: string;
  senderId: string;
  plaintext: string;
  sentAt: string; // ISO string (Meilisearch doesn't support Date natively)
}
