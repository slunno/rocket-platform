import { Router } from 'express';
import { globalSearchQuerySchema } from '@rocket/shared';
import { Prisma } from '../generated/prisma/client.js';
import { requireAuth } from '../auth.js';
import { prisma } from '../lib/prisma.js';

const router = Router();
const highlightOptions =
  'StartSel=__ROCKET_MATCH_START_8F31__, StopSel=__ROCKET_MATCH_END_8F31__, MaxWords=32, MinWords=8';

type MessageSearchRow = {
  id: string;
  snippet: string;
  createdAt: Date;
  authorId: string;
  authorName: string;
  authorAvatarUrl: string | null;
  channelId: string | null;
  channelName: string | null;
  teamId: string | null;
  teamName: string | null;
  conversationId: string | null;
  conversationName: string | null;
  hasAttachment: boolean;
};

type PersonSearchRow = {
  id: string;
  username: string;
  displayName: string;
  avatarUrl: string | null;
  status: string;
};

type ChannelSearchRow = {
  id: string;
  name: string;
  teamId: string;
  teamName: string;
  visibility: string;
};

type FileSearchRow = {
  id: string;
  messageId: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  createdAt: Date;
  snippet: string;
  authorName: string;
  channelId: string | null;
  channelName: string | null;
  teamId: string | null;
  teamName: string | null;
  conversationId: string | null;
  conversationName: string | null;
};

function visibleMessageSql(workspaceId: string, userId: string) {
  return Prisma.sql`(
    (
      m."conversationId" IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM "Conversation" AS c
        JOIN "ConversationMember" AS cm ON cm."conversationId" = c."id"
        WHERE c."id" = m."conversationId"
          AND c."workspaceId" = ${workspaceId}
          AND cm."userId" = ${userId}
      )
    )
    OR (
      m."channelId" IS NOT NULL
      AND EXISTS (
        SELECT 1
        FROM "Channel" AS ch
        JOIN "Team" AS t ON t."id" = ch."teamId"
        WHERE ch."id" = m."channelId"
          AND t."workspaceId" = ${workspaceId}
          AND ch."archivedAt" IS NULL
          AND t."archivedAt" IS NULL
          AND (
            (ch."visibility" = 'PUBLIC' AND EXISTS (
              SELECT 1 FROM "TeamMember" AS tm
              WHERE tm."teamId" = t."id" AND tm."userId" = ${userId}
            ))
            OR
            (ch."visibility" = 'PRIVATE' AND EXISTS (
              SELECT 1 FROM "ChannelMember" AS chm
              WHERE chm."channelId" = ch."id" AND chm."userId" = ${userId}
            ))
          )
      )
    )
  )`;
}

function messageFiltersSql({
  authorId,
  targetId,
  after,
  before,
  hasAttachment,
}: {
  authorId?: string;
  targetId?: string;
  after?: Date;
  before?: Date;
  hasAttachment: 'any' | 'yes' | 'no';
}) {
  const authorFilter = authorId ? Prisma.sql`AND m."authorId" = ${authorId}` : Prisma.empty;
  const targetFilter = targetId
    ? Prisma.sql`AND (m."channelId" = ${targetId} OR m."conversationId" = ${targetId})`
    : Prisma.empty;
  const afterFilter = after ? Prisma.sql`AND m."createdAt" >= ${after}` : Prisma.empty;
  const beforeFilter = before ? Prisma.sql`AND m."createdAt" <= ${before}` : Prisma.empty;
  const attachmentFilter =
    hasAttachment === 'yes'
      ? Prisma.sql`AND EXISTS (SELECT 1 FROM "Attachment" AS fa WHERE fa."messageId" = m."id" AND fa."uploadedAt" IS NOT NULL)`
      : hasAttachment === 'no'
        ? Prisma.sql`AND NOT EXISTS (SELECT 1 FROM "Attachment" AS fa WHERE fa."messageId" = m."id" AND fa."uploadedAt" IS NOT NULL)`
        : Prisma.empty;
  return Prisma.sql`${authorFilter} ${targetFilter} ${afterFilter} ${beforeFilter} ${attachmentFilter}`;
}

router.use(requireAuth);

router.get('/', async (req, res, next) => {
  try {
    const parsed = globalSearchQuerySchema.safeParse(req.query);
    if (!parsed.success)
      return res.status(400).json({
        error: { code: 'VALIDATION_ERROR', message: 'Os filtros da busca são inválidos.' },
      });

    const {
      q,
      workspaceId,
      type,
      from,
      in: targetId,
      after,
      before,
      hasAttachment,
      limit,
    } = parsed.data;
    const membership = await prisma.workspaceMember.findUnique({
      where: { workspaceId_userId: { workspaceId, userId: req.userId! } },
      select: { role: true },
    });
    if (!membership)
      return res.status(404).json({
        error: { code: 'WORKSPACE_NOT_FOUND', message: 'Espaço de trabalho não encontrado.' },
      });

    const includeMessages = type === 'all' || type === 'messages';
    const includePeople = type === 'all' || type === 'people';
    const includeChannels = type === 'all' || type === 'channels';
    const includeFiles = type === 'all' || type === 'files';
    const visibleMessage = visibleMessageSql(workspaceId, req.userId!);
    const messageFilters = messageFiltersSql({
      authorId: from,
      targetId,
      after,
      before,
      hasAttachment,
    });

    const [messages, people, channels, files] = await Promise.all([
      includeMessages
        ? prisma.$queryRaw<MessageSearchRow[]>(Prisma.sql`
            SELECT
              m."id",
              ts_headline('portuguese', m."text", websearch_to_tsquery('portuguese', ${q}), ${highlightOptions}) AS "snippet",
              m."createdAt",
              m."authorId",
              author."displayName" AS "authorName",
              author."avatarUrl" AS "authorAvatarUrl",
              m."channelId",
              ch."name" AS "channelName",
              t."id" AS "teamId",
              t."name" AS "teamName",
              m."conversationId",
              c."name" AS "conversationName",
              EXISTS (
                SELECT 1 FROM "Attachment" AS a
                WHERE a."messageId" = m."id" AND a."uploadedAt" IS NOT NULL
              ) AS "hasAttachment"
            FROM "Message" AS m
            JOIN "User" AS author ON author."id" = m."authorId"
            LEFT JOIN "Channel" AS ch ON ch."id" = m."channelId"
            LEFT JOIN "Team" AS t ON t."id" = ch."teamId"
            LEFT JOIN "Conversation" AS c ON c."id" = m."conversationId"
            WHERE m."deletedAt" IS NULL
              AND ${visibleMessage}
              AND to_tsvector('portuguese', m."text") @@ websearch_to_tsquery('portuguese', ${q})
              ${messageFilters}
            ORDER BY ts_rank(to_tsvector('portuguese', m."text"), websearch_to_tsquery('portuguese', ${q})) DESC, m."createdAt" DESC
            LIMIT ${limit}
          `)
        : Promise.resolve([] as MessageSearchRow[]),
      includePeople && membership.role !== 'GUEST'
        ? prisma.$queryRaw<PersonSearchRow[]>(Prisma.sql`
            SELECT u."id", u."username", u."displayName", u."avatarUrl", u."status"::text AS "status"
            FROM "User" AS u
            JOIN "WorkspaceMember" AS wm ON wm."userId" = u."id"
            WHERE wm."workspaceId" = ${workspaceId}
              AND u."id" <> ${req.userId!}
              AND to_tsvector(
                'portuguese',
                coalesce(u."displayName", '') || ' ' || coalesce(u."username", '') || ' ' || coalesce(u."jobTitle", '')
              ) @@ websearch_to_tsquery('portuguese', ${q})
            ORDER BY ts_rank(
              to_tsvector(
                'portuguese',
                coalesce(u."displayName", '') || ' ' || coalesce(u."username", '') || ' ' || coalesce(u."jobTitle", '')
              ),
              websearch_to_tsquery('portuguese', ${q})
            ) DESC, u."displayName" ASC
            LIMIT ${limit}
          `)
        : Promise.resolve([] as PersonSearchRow[]),
      includeChannels
        ? prisma.$queryRaw<ChannelSearchRow[]>(Prisma.sql`
            SELECT ch."id", ch."name", t."id" AS "teamId", t."name" AS "teamName", ch."visibility"::text AS "visibility"
            FROM "Channel" AS ch
            JOIN "Team" AS t ON t."id" = ch."teamId"
            WHERE t."workspaceId" = ${workspaceId}
              AND ch."archivedAt" IS NULL
              AND t."archivedAt" IS NULL
              AND (
                (ch."visibility" = 'PUBLIC' AND EXISTS (
                  SELECT 1 FROM "TeamMember" AS tm
                  WHERE tm."teamId" = t."id" AND tm."userId" = ${req.userId!}
                ))
                OR
                (ch."visibility" = 'PRIVATE' AND EXISTS (
                  SELECT 1 FROM "ChannelMember" AS chm
                  WHERE chm."channelId" = ch."id" AND chm."userId" = ${req.userId!}
                ))
              )
              AND to_tsvector(
                'portuguese',
                coalesce(ch."name", '') || ' ' || coalesce(ch."description", '')
              ) @@ websearch_to_tsquery('portuguese', ${q})
              AND (${targetId ?? null}::text IS NULL OR ch."id" = ${targetId ?? null})
            ORDER BY ts_rank(
              to_tsvector(
                'portuguese',
                coalesce(ch."name", '') || ' ' || coalesce(ch."description", '')
              ),
              websearch_to_tsquery('portuguese', ${q})
            ) DESC, ch."name" ASC
            LIMIT ${limit}
          `)
        : Promise.resolve([] as ChannelSearchRow[]),
      includeFiles && hasAttachment !== 'no'
        ? prisma.$queryRaw<FileSearchRow[]>(Prisma.sql`
            SELECT
              a."id",
              m."id" AS "messageId",
              a."fileName",
              a."mimeType",
              a."sizeBytes"::double precision AS "sizeBytes",
              a."createdAt",
              CASE
                WHEN to_tsvector('portuguese', a."fileName") @@ websearch_to_tsquery('portuguese', ${q})
                  OR position(lower(${q}) in lower(a."fileName")) > 0
                  THEN ts_headline('portuguese', a."fileName", websearch_to_tsquery('portuguese', ${q}), ${highlightOptions})
                ELSE ts_headline('portuguese', m."text", websearch_to_tsquery('portuguese', ${q}), ${highlightOptions})
              END AS "snippet",
              author."displayName" AS "authorName",
              m."channelId",
              ch."name" AS "channelName",
              t."id" AS "teamId",
              t."name" AS "teamName",
              m."conversationId",
              c."name" AS "conversationName"
            FROM "Attachment" AS a
            JOIN "Message" AS m ON m."id" = a."messageId"
            JOIN "User" AS author ON author."id" = m."authorId"
            LEFT JOIN "Channel" AS ch ON ch."id" = m."channelId"
            LEFT JOIN "Team" AS t ON t."id" = ch."teamId"
            LEFT JOIN "Conversation" AS c ON c."id" = m."conversationId"
            WHERE a."uploadedAt" IS NOT NULL
              AND m."deletedAt" IS NULL
              AND ${visibleMessage}
              AND (
                to_tsvector('portuguese', a."fileName") @@ websearch_to_tsquery('portuguese', ${q})
                OR position(lower(${q}) in lower(a."fileName")) > 0
                OR to_tsvector('portuguese', m."text") @@ websearch_to_tsquery('portuguese', ${q})
              )
              ${messageFilters}
            ORDER BY ts_rank(to_tsvector('portuguese', a."fileName"), websearch_to_tsquery('portuguese', ${q})) DESC, a."createdAt" DESC
            LIMIT ${limit}
          `)
        : Promise.resolve([] as FileSearchRow[]),
    ]);

    return res.json({
      messages: messages.map((message) => ({
        id: message.id,
        snippet: message.snippet,
        createdAt: message.createdAt,
        author: {
          id: message.authorId,
          displayName: message.authorName,
          avatarUrl: message.authorAvatarUrl,
        },
        target: message.channelId
          ? {
              type: 'channel' as const,
              id: message.channelId,
              name: message.channelName,
              teamId: message.teamId,
              teamName: message.teamName,
            }
          : {
              type: 'conversation' as const,
              id: message.conversationId!,
              name: message.conversationName,
            },
        hasAttachment: message.hasAttachment,
      })),
      people,
      channels,
      files: files.map((file) => ({
        id: file.id,
        fileName: file.fileName,
        mimeType: file.mimeType,
        sizeBytes: file.sizeBytes,
        createdAt: file.createdAt,
        snippet: file.snippet,
        authorName: file.authorName,
        target: file.channelId
          ? {
              type: 'channel' as const,
              id: file.channelId,
              name: file.channelName,
              teamId: file.teamId,
              teamName: file.teamName,
            }
          : {
              type: 'conversation' as const,
              id: file.conversationId!,
              name: file.conversationName,
            },
      })),
    });
  } catch (error) {
    return next(error);
  }
});

export function createSearchRouter() {
  return router;
}
