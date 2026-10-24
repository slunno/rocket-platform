import { z } from 'zod';

export const apiErrorSchema = z.object({
  error: z.object({
    code: z.string(),
    message: z.string(),
  }),
});

export const MAX_ATTACHMENT_SIZE_BYTES = 25 * 1024 * 1024;
export const MAX_ATTACHMENTS_PER_MESSAGE = 10;

export const attachmentInputSchema = z.object({
  fileName: z.string().trim().min(1).max(255),
  mimeType: z.enum([
    'image/jpeg',
    'image/png',
    'image/gif',
    'image/webp',
    'application/pdf',
    'text/plain',
  ]),
  sizeBytes: z.number().int().min(1).max(MAX_ATTACHMENT_SIZE_BYTES),
});

export const messageInputSchema = z
  .object({
    text: z.string().trim().max(10_000).default(''),
    clientMessageId: z.string().uuid().optional(),
    attachments: z.array(attachmentInputSchema).max(MAX_ATTACHMENTS_PER_MESSAGE).default([]),
  })
  .superRefine(({ text, attachments }, context) => {
    if (!text && attachments.length === 0) {
      context.addIssue({
        code: 'custom',
        path: ['text'],
        message: 'Escreva uma mensagem ou anexe um arquivo.',
      });
    }
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
const secureImageUrlSchema = z
  .string()
  .trim()
  .url()
  .max(2048)
  .refine((value) => /^https:\/\//i.test(value), 'A imagem deve usar HTTPS.')
  .nullable()
  .optional();

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
export const directConversationCreateInputSchema = z.object({ targetUserId: z.string().min(1) });
export const groupConversationCreateInputSchema = z.object({
  name: organizationNameSchema,
  avatarUrl: secureImageUrlSchema,
  userIds: z
    .array(z.string().min(1))
    .min(1)
    .max(49)
    .refine((userIds) => new Set(userIds).size === userIds.length),
});
export const groupConversationUpdateInputSchema = z
  .object({
    name: organizationNameSchema.optional(),
    description: descriptionSchema,
    avatarUrl: secureImageUrlSchema,
  })
  .refine((value) => Object.keys(value).length > 0);
export const conversationPreferenceInputSchema = z
  .object({
    muted: z.boolean().optional(),
    pinned: z.boolean().optional(),
    notificationLevel: z.enum(['ALL', 'MENTIONS', 'MUTED']).optional(),
  })
  .refine((value) => Object.keys(value).length > 0);
export const channelPreferenceInputSchema = z
  .object({
    favorite: z.boolean().optional(),
    hidden: z.boolean().optional(),
    notificationLevel: z.enum(['ALL', 'MENTIONS', 'MUTED']).optional(),
  })
  .refine((value) => Object.keys(value).length > 0);

export const activityQuerySchema = z.object({
  filter: z.enum(['all', 'unread', 'mentions']).default('all'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().trim().min(1).max(128).optional(),
});

export const pushSubscriptionInputSchema = z.object({
  endpoint: z
    .string()
    .trim()
    .url()
    .max(2048)
    .refine((value) => /^https:\/\//i.test(value)),
  keys: z.object({
    p256dh: z.string().trim().min(32).max(256),
    auth: z.string().trim().min(16).max(256),
  }),
});

export const socketEvents = {
  messageCreated: 'message:created',
  messageUpdated: 'message:updated',
  messageDeleted: 'message:deleted',
  reactionAdded: 'reaction:added',
  reactionRemoved: 'reaction:removed',
  typing: 'typing',
  readUpdated: 'read:updated',
  conversationUpdated: 'conversation:updated',
  attachmentReady: 'attachment:ready',
  presenceHeartbeat: 'presence:heartbeat',
  presenceUpdated: 'presence:updated',
  presenceSnapshot: 'presence:snapshot',
  notificationCreated: 'notification:created',
} as const;

export const PRESENCE_HEARTBEAT_INTERVAL_MS = 20_000;

export const paginationQuerySchema = z.object({
  limit: z.coerce.number().int().min(1).max(100).default(50),
  cursor: z.string().trim().min(1).max(128).optional(),
});

export const fileListQuerySchema = z.object({
  query: z.string().trim().max(100).default(''),
  sortBy: z.enum(['recent', 'name', 'size']).default('recent'),
  limit: z.coerce.number().int().min(1).max(100).default(50),
});

export const globalSearchQuerySchema = z
  .object({
    q: z.string().trim().min(2).max(200),
    workspaceId: z.string().trim().min(1).max(128),
    type: z.enum(['all', 'messages', 'people', 'channels', 'files']).default('all'),
    from: z.string().trim().min(1).max(128).optional(),
    in: z.string().trim().min(1).max(128).optional(),
    after: z.coerce.date().optional(),
    before: z.coerce.date().optional(),
    hasAttachment: z.enum(['any', 'yes', 'no']).default('any'),
    limit: z.coerce.number().int().min(1).max(10).default(5),
  })
  .superRefine(({ after, before }, context) => {
    if (after && before && after > before) {
      context.addIssue({
        code: 'custom',
        path: ['after'],
        message: 'A data inicial deve ser anterior à data final.',
      });
    }
  });

const calendarTimeZoneSchema = z
  .string()
  .trim()
  .min(1)
  .max(64)
  .refine((value) => {
    try {
      new Intl.DateTimeFormat('pt-BR', { timeZone: value });
      return true;
    } catch {
      return false;
    }
  }, 'Informe um fuso horário válido.');

export const calendarEventCreateInputSchema = z
  .object({
    title: z.string().trim().min(2).max(120),
    description: z.string().trim().max(2000).nullable().optional(),
    startAt: z.coerce.date(),
    endAt: z.coerce.date(),
    timeZone: calendarTimeZoneSchema.default('America/Sao_Paulo'),
    recurrence: z.enum(['NONE', 'DAILY', 'WEEKLY', 'MONTHLY']).default('NONE'),
    recurrenceUntil: z.coerce.date().optional(),
    reminderMinutes: z.number().int().min(0).max(10080).default(15),
    attendeeIds: z.array(z.string().trim().min(1).max(128)).max(100).default([]),
  })
  .superRefine((event, context) => {
    if (event.endAt <= event.startAt) {
      context.addIssue({
        code: 'custom',
        path: ['endAt'],
        message: 'A reunião precisa terminar depois de começar.',
      });
    }
    if (event.recurrence !== 'NONE') {
      if (!event.recurrenceUntil || event.recurrenceUntil < event.startAt) {
        context.addIssue({
          code: 'custom',
          path: ['recurrenceUntil'],
          message: 'Informe até quando o evento recorrente deve se repetir.',
        });
      } else if (event.recurrenceUntil.getTime() - event.startAt.getTime() > 366 * 86_400_000) {
        context.addIssue({
          code: 'custom',
          path: ['recurrenceUntil'],
          message: 'A recorrência pode ser configurada por até um ano.',
        });
      }
    } else if (event.recurrenceUntil) {
      context.addIssue({
        code: 'custom',
        path: ['recurrenceUntil'],
        message: 'Data final de recorrência não se aplica a evento único.',
      });
    }
    if (new Set(event.attendeeIds).size !== event.attendeeIds.length) {
      context.addIssue({
        code: 'custom',
        path: ['attendeeIds'],
        message: 'A lista de participantes contém duplicatas.',
      });
    }
  });

export const calendarEventsQuerySchema = z
  .object({
    from: z.coerce.date(),
    to: z.coerce.date(),
  })
  .superRefine(({ from, to }, context) => {
    if (to <= from || to.getTime() - from.getTime() > 93 * 86_400_000) {
      context.addIssue({
        code: 'custom',
        path: ['to'],
        message: 'A janela do calendário deve ter entre um momento e 93 dias.',
      });
    }
  });

export const calendarAttendeeResponseInputSchema = z.object({
  status: z.enum(['ACCEPTED', 'DECLINED']),
});

export const meetingNowInputSchema = z
  .object({
    conversationId: z.string().trim().min(1).max(128).optional(),
    channelId: z.string().trim().min(1).max(128).optional(),
  })
  .refine((input) => Boolean(input.conversationId) !== Boolean(input.channelId), {
    message: 'Selecione uma conversa direta ou um canal para a reunião.',
  });

export const calendarEventUpdateInputSchema = z
  .object({
    title: z.string().trim().min(2).max(120).optional(),
    description: z.string().trim().max(2000).nullable().optional(),
    startAt: z.coerce.date().optional(),
    endAt: z.coerce.date().optional(),
    timeZone: calendarTimeZoneSchema.optional(),
    reminderMinutes: z.number().int().min(0).max(10080).optional(),
    recurrence: z.enum(['NONE', 'DAILY', 'WEEKLY', 'MONTHLY']).optional(),
    recurrenceUntil: z.coerce.date().nullable().optional(),
    attendeeIds: z.array(z.string().trim().min(1).max(128)).max(100).optional(),
  })
  .refine((value) => Object.keys(value).length > 0, 'Informe ao menos um campo para atualizar.');

export const attachmentDownloadQuerySchema = z.object({
  disposition: z.enum(['inline', 'attachment']).default('attachment'),
});

export type ApiError = z.infer<typeof apiErrorSchema>;
export type MessageInput = z.infer<typeof messageInputSchema>;
export type AttachmentInput = z.infer<typeof attachmentInputSchema>;
export type MessageUpdateInput = z.infer<typeof messageUpdateInputSchema>;
export type ReactionInput = z.infer<typeof reactionInputSchema>;
export type TypingInput = z.infer<typeof typingInputSchema>;
export type UserSummary = z.infer<typeof userSummarySchema>;
export type RegisterInput = z.infer<typeof registerInputSchema>;
export type LoginInput = z.infer<typeof loginInputSchema>;
export type PaginationQuery = z.infer<typeof paginationQuerySchema>;
export type FileListQuery = z.infer<typeof fileListQuerySchema>;
export type GlobalSearchQuery = z.infer<typeof globalSearchQuerySchema>;
export type CalendarEventCreateInput = z.infer<typeof calendarEventCreateInputSchema>;
export type CalendarEventsQuery = z.infer<typeof calendarEventsQuerySchema>;
export type CalendarAttendeeResponseInput = z.infer<typeof calendarAttendeeResponseInputSchema>;
export type MeetingNowInput = z.infer<typeof meetingNowInputSchema>;
export type CalendarEventUpdateInput = z.infer<typeof calendarEventUpdateInputSchema>;
export type AttachmentDownloadQuery = z.infer<typeof attachmentDownloadQuerySchema>;
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
export type DirectConversationCreateInput = z.infer<typeof directConversationCreateInputSchema>;
export type GroupConversationCreateInput = z.infer<typeof groupConversationCreateInputSchema>;
export type GroupConversationUpdateInput = z.infer<typeof groupConversationUpdateInputSchema>;
export type ActivityQuery = z.infer<typeof activityQuerySchema>;
export type PushSubscriptionInput = z.infer<typeof pushSubscriptionInputSchema>;
export type SocketEvent = (typeof socketEvents)[keyof typeof socketEvents];
