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

export const messageUpdateInputSchema = z.object({
  text: z.string().trim().min(1).max(10_000),
});

export const reactionInputSchema = z.object({
  emoji: z.string().trim().min(1).max(32),
});

export const typingInputSchema = z.discriminatedUnion('targetType', [
  z.object({
    targetType: z.literal('CHANNEL'),
    targetId: z.string().min(1),
    isTyping: z.boolean(),
  }),
  z.object({
    targetType: z.literal('CONVERSATION'),
    targetId: z.string().min(1),
    isTyping: z.boolean(),
  }),
]);

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

const organizationNameSchema = z.string().trim().min(2).max(80);
const descriptionSchema = z.string().trim().max(300).nullable().optional();

export const workspaceCreateInputSchema = z.object({ name: organizationNameSchema });
export const workspaceUpdateInputSchema = z
  .object({ name: organizationNameSchema })
  .partial()
  .refine((value) => Object.keys(value).length > 0);
export const workspaceMemberRoleUpdateInputSchema = z.object({
  role: z.enum(['ADMIN', 'MEMBER', 'GUEST']),
});

export const teamCreateInputSchema = z.object({
  name: organizationNameSchema,
  description: descriptionSchema,
});
export const teamUpdateInputSchema = z
  .object({ name: organizationNameSchema.optional(), description: descriptionSchema })
  .refine((value) => Object.keys(value).length > 0);

export const channelVisibilitySchema = z.enum(['PUBLIC', 'PRIVATE']);
export const channelCreateInputSchema = z.object({
  name: organizationNameSchema,
  description: descriptionSchema,
  visibility: channelVisibilitySchema.default('PUBLIC'),
});
export const channelUpdateInputSchema = z
  .object({
    name: organizationNameSchema.optional(),
    description: descriptionSchema,
    visibility: channelVisibilitySchema.optional(),
  })
  .refine((value) => Object.keys(value).length > 0);

export const workspaceInviteInputSchema = z.object({
  email: emailSchema,
  role: z.enum(['MEMBER', 'GUEST']).default('MEMBER'),
  teamId: z.string().min(1).optional(),
});
export const workspaceInviteAcceptInputSchema = z.object({
  token: z.string().min(32).max(256),
});
export const memberInputSchema = z.object({ userId: z.string().min(1) });
export const channelPreferenceInputSchema = z
  .object({ favorite: z.boolean().optional(), hidden: z.boolean().optional() })
  .refine((value) => Object.keys(value).length > 0);

export const socketEvents = {
  messageCreated: 'message:created',
  messageUpdated: 'message:updated',
  messageDeleted: 'message:deleted',
  reactionAdded: 'reaction:added',
  reactionRemoved: 'reaction:removed',
  typing: 'typing',
  readUpdated: 'read:updated',
} as const;

export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().trim().min(1).max(128).optional(),
});

export type ApiError = z.infer<typeof apiErrorSchema>;
export type MessageInput = z.infer<typeof messageInputSchema>;
export type MessageUpdateInput = z.infer<typeof messageUpdateInputSchema>;
export type ReactionInput = z.infer<typeof reactionInputSchema>;
export type TypingInput = z.infer<typeof typingInputSchema>;
export type UserSummary = z.infer<typeof userSummarySchema>;
export type RegisterInput = z.infer<typeof registerInputSchema>;
export type LoginInput = z.infer<typeof loginInputSchema>;
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
export type ProfileUpdateInput = z.infer<typeof profileUpdateInputSchema>;
export type WorkspaceCreateInput = z.infer<typeof workspaceCreateInputSchema>;
export type WorkspaceUpdateInput = z.infer<typeof workspaceUpdateInputSchema>;
export type WorkspaceMemberRoleUpdateInput = z.infer<typeof workspaceMemberRoleUpdateInputSchema>;
export type TeamCreateInput = z.infer<typeof teamCreateInputSchema>;
export type TeamUpdateInput = z.infer<typeof teamUpdateInputSchema>;
export type ChannelCreateInput = z.infer<typeof channelCreateInputSchema>;
export type ChannelUpdateInput = z.infer<typeof channelUpdateInputSchema>;
export type WorkspaceInviteInput = z.infer<typeof workspaceInviteInputSchema>;
export type WorkspaceInviteAcceptInput = z.infer<typeof workspaceInviteAcceptInputSchema>;
export type SocketEvent = (typeof socketEvents)[keyof typeof socketEvents];
