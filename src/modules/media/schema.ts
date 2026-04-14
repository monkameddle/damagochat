import { z } from 'zod';

export const ALLOWED_MIME_TYPES = [
  'image/jpeg',
  'image/png',
  'image/webp',
  'video/mp4',
  'audio/ogg',
  'application/pdf',
] as const;

export type AllowedMimeType = (typeof ALLOWED_MIME_TYPES)[number];

export const PrepareUploadSchema = z.object({
  mimeType: z.enum(ALLOWED_MIME_TYPES),
  sizeBytes: z.number().int().positive(),
});

export type PrepareUploadInput = z.infer<typeof PrepareUploadSchema>;

export interface PrepareUploadResult {
  mediaId: string;
  uploadUrl: string;
  s3Key: string;
  expiresIn: number;
}

export interface MediaObjectResult {
  id: string;
  s3Key: string;
  mimeType: string;
  sizeBytes: number;
  thumbnailKey: string | null;
  downloadUrl: string;
  thumbnailUrl: string | null;
}

// Redis key for pending (not yet linked to message) media
export const pendingMediaKey = (mediaId: string) => `pending-media:${mediaId}`;
export const PENDING_MEDIA_TTL = 3600; // 1 hour to complete upload + send message
