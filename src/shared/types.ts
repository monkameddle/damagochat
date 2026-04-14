import type { FastifyRequest } from 'fastify';

export interface JwtPayload {
  sub: string;    // userId
  deviceId: string;
  iat: number;
  exp: number;
}

export interface AuthenticatedRequest extends FastifyRequest {
  user: JwtPayload;
}

// WebSocket envelope
export interface WsMessage<T = unknown> {
  type: string;
  payload: T;
  id?: string;
}

export type WsHandler<T = unknown> = (
  userId: string,
  msg: WsMessage<T>,
) => Promise<void>;

// Pagination
export interface PaginationParams {
  cursor?: string;
  limit: number;
}

export interface PaginatedResult<T> {
  items: T[];
  nextCursor?: string;
}
