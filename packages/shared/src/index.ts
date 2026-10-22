import { z } from 'zod';

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});

export const messageInputSchema = z.object({
  text: z.string().trim().min(1).max(10_000),
  clientMessageId: z.string().uuid().optional(),
});

export const userSummarySchema = z.object({
  id: z.string(),
  username: z.string(),
  displayName: z.string(),
  avatarUrl: z.string().nullable().optional(),
  status: z.enum(['ONLINE', 'AWAY', 'OFFLINE']),
});

export const socketEvents = {
  messageCreated: 'message:created',
  messageUpdated: 'message:updated',
  messageDeleted: 'message:deleted',
  reactionAdded: 'reaction:added',
  reactionRemoved: 'reaction:removed',
  typing: 'typing',
} as const;

export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export type ApiError = z.infer<typeof apiErrorSchema>;
export type MessageInput = z.infer<typeof messageInputSchema>;
export type UserSummary = z.infer<typeof userSummarySchema>;
export type SocketEvent = (typeof socketEvents)[keyof typeof socketEvents];
