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
  status: z.enum(['ONLINE', 'BUSY', 'DO_NOT_DISTURB', 'AWAY', 'OFFLINE']),
});

const emailSchema = z
  .string()
  .trim()
  .email()
  .max(254)
  .transform((email) => email.toLowerCase());

export const registerInputSchema = z.object({
  email: emailSchema,
  password: z.string().min(12).max(128),
  displayName: z.string().trim().min(2).max(80),
});

export const loginInputSchema = z.object({
  email: emailSchema,
  password: z.string().min(1).max(128),
});

export const forgotPasswordInputSchema = z.object({ email: emailSchema });

export const resetPasswordInputSchema = z.object({
  token: z.string().min(32).max(256),
  password: z.string().min(12).max(128),
});

export const profileUpdateInputSchema = z
  .object({
    displayName: z.string().trim().min(2).max(80).optional(),
    avatarUrl: z
      .string()
      .trim()
      .url()
      .max(2048)
      .refine((value) => ['http:', 'https:'].includes(new URL(value).protocol))
      .nullable()
      .optional(),
    jobTitle: z.string().trim().max(100).nullable().optional(),
    timeZone: z.string().trim().min(1).max(100).optional(),
    locale: z.enum(['pt-BR', 'en-US', 'es-ES']).optional(),
    status: z.enum(['ONLINE', 'BUSY', 'DO_NOT_DISTURB', 'AWAY', 'OFFLINE']).optional(),
    statusMessage: z.string().trim().max(140).nullable().optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Informe ao menos um campo para atualizar.');

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
export type RegisterInput = z.infer<typeof registerInputSchema>;
export type LoginInput = z.infer<typeof loginInputSchema>;
export type ProfileUpdateInput = z.infer<typeof profileUpdateInputSchema>;
export type SocketEvent = (typeof socketEvents)[keyof typeof socketEvents];
