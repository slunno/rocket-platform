import type { NotificationKind, NotificationLevel } from '../generated/prisma/client.js';
import { prisma } from '../lib/prisma.js';
import { enqueueActivityNotification } from './queue.js';
import { shouldCreateActivityNotification } from './preferences.js';

type NotificationTarget =
  | { conversationId: string; channelId?: never; workspaceId?: never }
  | { channelId: string; workspaceId?: string; conversationId?: never }
  | { workspaceId: string; conversationId?: never; channelId?: never };

type NotificationCandidate = {
  userId: string;
  notificationLevel: NotificationLevel;
  muted?: boolean;
};

const mentionHandles = (text: string) =>
  [...text.matchAll(/(?:^|\s)@([a-z\d][a-z\d._-]*[a-z\d]|[a-z\d])/gi)].map((match) =>
    match[1]!.toLowerCase(),
  );

async function createActivityNotifications(
  kind: NotificationKind,
  sourceKey: string,
  actorId: string,
  target: NotificationTarget,
  candidates: NotificationCandidate[],
  messageId?: string,
) {
  const eligible = [
    ...new Map(candidates.map((candidate) => [candidate.userId, candidate])).values(),
  ]
    .filter(
      (candidate) =>
        candidate.userId !== actorId &&
        shouldCreateActivityNotification(kind, candidate.notificationLevel, candidate.muted),
    )
    .map((candidate) => ({
      recipientId: candidate.userId,
      actorId,
      kind,
      sourceKey: `${sourceKey}:${candidate.userId}`,
      ...target,
      ...(messageId ? { messageId } : {}),
    }));
  if (!eligible.length) return;

  await prisma.activityNotification.createMany({ data: eligible, skipDuplicates: true });
  const createdOrExisting = await prisma.activityNotification.findMany({
    where: {
      recipientId: { in: eligible.map(({ recipientId }) => recipientId) },
      sourceKey: { in: eligible.map(({ sourceKey: key }) => key) },
    },
    select: { id: true },
  });
  await Promise.all(
    createdOrExisting.map(async ({ id }) => {
      try {
        await enqueueActivityNotification(id);
      } catch (error) {
        console.error(
          'Could not queue activity notification:',
          id,
          error instanceof Error ? error.message : error,
        );
      }
    }),
  );
}

export async function notifyMessageCreated(input: {
  messageId: string;
  authorId: string;
  text: string;
  replyToId?: string | null;
  conversationId?: string;
  channelId?: string;
}) {
  const target = input.conversationId
    ? ({ conversationId: input.conversationId } as const)
    : input.channelId
      ? ({ channelId: input.channelId } as const)
      : null;
  if (!target) return;

  const handles = mentionHandles(input.text);
  const requestedHandles = [...new Set(handles.filter((handle) => handle !== 'canal'))];
  let candidates: NotificationCandidate[];
  let mentionCandidates: NotificationCandidate[];

  if (input.conversationId) {
    const memberships = await prisma.conversationMember.findMany({
      where: { conversationId: input.conversationId, userId: { not: input.authorId } },
      select: {
        userId: true,
        muted: true,
        notificationLevel: true,
        user: { select: { username: true } },
      },
    });
    candidates = memberships.map(({ userId, muted, notificationLevel }) => ({
      userId,
      muted,
      notificationLevel,
    }));
    const mentionAll = handles.includes('canal');
    mentionCandidates = memberships
      .filter(({ user }) => mentionAll || requestedHandles.includes(user.username.toLowerCase()))
      .map(({ userId, muted, notificationLevel }) => ({ userId, muted, notificationLevel }));
  } else {
    const channel = await prisma.channel.findUnique({
      where: { id: input.channelId! },
      select: { id: true, teamId: true, visibility: true, team: { select: { workspaceId: true } } },
    });
    if (!channel) return;
    const members =
      channel.visibility === 'PUBLIC'
        ? await prisma.teamMember.findMany({
            where: { teamId: channel.teamId, userId: { not: input.authorId } },
            select: { userId: true, user: { select: { username: true } } },
          })
        : await prisma.channelMember.findMany({
            where: { channelId: channel.id, userId: { not: input.authorId } },
            select: { userId: true, user: { select: { username: true } } },
          });
    const preferences = await prisma.channelPreference.findMany({
      where: { channelId: channel.id, userId: { in: members.map(({ userId }) => userId) } },
      select: { userId: true, notificationLevel: true },
    });
    const preferenceByUser = new Map(
      preferences.map((preference) => [preference.userId, preference]),
    );
    const allMembers = members.map(
      ({ userId }) =>
        ({
          userId,
          notificationLevel: preferenceByUser.get(userId)?.notificationLevel ?? 'ALL',
        }) satisfies NotificationCandidate,
    );
    candidates = allMembers;
    const mentionAll = handles.includes('canal');
    const mentionedIds = new Set(
      members
        .filter(({ user }) => mentionAll || requestedHandles.includes(user.username.toLowerCase()))
        .map(({ userId }) => userId),
    );
    mentionCandidates = allMembers.filter(({ userId }) => mentionedIds.has(userId));
    Object.assign(target, { workspaceId: channel.team.workspaceId });
  }

  await createActivityNotifications(
    'MENTION',
    `message:${input.messageId}:mention`,
    input.authorId,
    target,
    mentionCandidates,
    input.messageId,
  );

  if (input.replyToId) {
    const root = await prisma.message.findUnique({
      where: { id: input.replyToId },
      select: { authorId: true },
    });
    const recipient = root?.authorId;
    const candidate = candidates.find(({ userId }) => userId === recipient);
    if (candidate) {
      await createActivityNotifications(
        'REPLY',
        `message:${input.messageId}:reply`,
        input.authorId,
        target,
        [candidate],
        input.messageId,
      );
    }
  }
}

export async function notifyReactionAdded(input: {
  messageId: string;
  actorId: string;
  emoji: string;
  reactionCreatedAt: Date;
  recipientId: string;
  conversationId?: string | null;
  channelId?: string | null;
  workspaceId?: string;
}) {
  if (input.recipientId === input.actorId) return;
  let candidate: NotificationCandidate | undefined;
  let target: NotificationTarget;
  if (input.conversationId) {
    const membership = await prisma.conversationMember.findUnique({
      where: {
        conversationId_userId: { conversationId: input.conversationId, userId: input.recipientId },
      },
      select: { muted: true, notificationLevel: true },
    });
    if (!membership) return;
    candidate = { userId: input.recipientId, ...membership };
    target = { conversationId: input.conversationId };
  } else if (input.channelId) {
    const channel = await prisma.channel.findFirst({
      where: {
        id: input.channelId,
        OR: [
          { visibility: 'PUBLIC', team: { members: { some: { userId: input.recipientId } } } },
          { visibility: 'PRIVATE', members: { some: { userId: input.recipientId } } },
        ],
      },
      select: { id: true, team: { select: { workspaceId: true } } },
    });
    if (!channel) return;
    const preference = await prisma.channelPreference.findUnique({
      where: { channelId_userId: { channelId: input.channelId, userId: input.recipientId } },
      select: { notificationLevel: true },
    });
    candidate = {
      userId: input.recipientId,
      notificationLevel: preference?.notificationLevel ?? 'ALL',
    };
    target = { channelId: input.channelId, workspaceId: channel.team.workspaceId };
  } else {
    return;
  }

  await createActivityNotifications(
    'REACTION',
    `reaction:${input.messageId}:${input.actorId}:${input.emoji}:${input.reactionCreatedAt.getTime()}`,
    input.actorId,
    target,
    [candidate],
    input.messageId,
  );
}

export async function notifyInviteAccepted(input: {
  inviteId: string;
  workspaceId: string;
  actorId: string;
  recipientId: string;
}) {
  await createActivityNotifications(
    'INVITE',
    `invite:${input.inviteId}:accepted`,
    input.actorId,
    { workspaceId: input.workspaceId },
    [{ userId: input.recipientId, notificationLevel: 'ALL' }],
  );
}
