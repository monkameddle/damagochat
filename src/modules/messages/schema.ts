import { z } from 'zod';

export const MessageCursorSchema = z.object({
  cursor: z.string().optional(),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type MessageCursorInput = z.infer<typeof MessageCursorSchema>;

// WebSocket payloads
export const WsSendMessageSchema = z.object({
  chatId: z.string().uuid(),
  type: z.enum(['TEXT', 'IMAGE', 'VIDEO', 'AUDIO', 'DOCUMENT']).default('TEXT'),
  ciphertext: z.string().min(1),
  mediaKey: z.string().optional(),
  mediaId: z.string().uuid().optional(),
  clientMsgId: z.string().optional(), // dedup / client-side tracking
});

export const WsDeleteMessageSchema = z.object({
  messageId: z.string().uuid(),
  chatId: z.string().uuid(),
});

export const WsReactMessageSchema = z.object({
  messageId: z.string().uuid(),
  chatId: z.string().uuid(),
  emoji: z.string().min(1).max(10),
});

export const WsReceiptSchema = z.object({
  messageId: z.string().uuid(),
  chatId: z.string().uuid(),
});

export type WsSendMessageInput = z.infer<typeof WsSendMessageSchema>;
export type WsDeleteMessageInput = z.infer<typeof WsDeleteMessageSchema>;
export type WsReactMessageInput = z.infer<typeof WsReactMessageSchema>;
export type WsReceiptInput = z.infer<typeof WsReceiptSchema>;

export interface MessageRow {
  id: string;
  chatId: string;
  senderId: string;
  type: string;
  ciphertext: string;
  mediaKey: string | null;
  status: string;
  sentAt: Date;
  deletedAt: Date | null;
  reactions: { id: string; userId: string; emoji: string }[];
  media: {
    id: string;
    s3Key: string;
    mimeType: string;
    sizeBytes: number;
    thumbnailKey: string | null;
  } | null;
}
