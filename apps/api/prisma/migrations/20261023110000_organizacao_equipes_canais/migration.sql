ALTER TYPE "WorkspaceRole" ADD VALUE 'GUEST';

CREATE TYPE "ChannelVisibility" AS ENUM ('PUBLIC', 'PRIVATE');

ALTER TABLE "Workspace"
ADD COLUMN "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP;

CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMP(3),
    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TeamMember" (
    "teamId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "TeamMember_pkey" PRIMARY KEY ("teamId", "userId")
);

CREATE TABLE "Channel" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "description" TEXT,
    "visibility" "ChannelVisibility" NOT NULL DEFAULT 'PUBLIC',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "archivedAt" TIMESTAMP(3),
    CONSTRAINT "Channel_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ChannelMember" (
    "channelId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "joinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChannelMember_pkey" PRIMARY KEY ("channelId", "userId")
);

CREATE TABLE "ChannelPreference" (
    "channelId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "favorite" BOOLEAN NOT NULL DEFAULT false,
    "hidden" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ChannelPreference_pkey" PRIMARY KEY ("channelId", "userId")
);

CREATE TABLE "WorkspaceInvite" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "teamId" TEXT,
    "email" TEXT NOT NULL,
    "role" "WorkspaceRole" NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "canceledAt" TIMESTAMP(3),
    "invitedById" TEXT NOT NULL,
    "acceptedById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WorkspaceInvite_pkey" PRIMARY KEY ("id")
);

ALTER TABLE "Message"
ADD COLUMN "channelId" TEXT;

DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM "Conversation"
        WHERE "type" = 'CHANNEL' AND "workspaceId" IS NULL
    ) AND NOT EXISTS (SELECT 1 FROM "Workspace") THEN
        INSERT INTO "Workspace" ("id", "name", "slug", "createdAt", "updatedAt")
        VALUES ('workspace-migrado', 'AKR Brands', 'workspace-migrado', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP);
    END IF;
END $$;

UPDATE "Conversation"
SET "workspaceId" = (SELECT "id" FROM "Workspace" ORDER BY "createdAt", "id" LIMIT 1)
WHERE "type" = 'CHANNEL'
  AND "workspaceId" IS NULL
  AND EXISTS (SELECT 1 FROM "Workspace");

INSERT INTO "WorkspaceMember" ("workspaceId", "userId", "role", "joinedAt")
SELECT c."workspaceId", cm."userId", 'MEMBER', MIN(cm."joinedAt")
FROM "Conversation" c
JOIN "ConversationMember" cm ON cm."conversationId" = c."id"
WHERE c."type" = 'CHANNEL' AND c."workspaceId" IS NOT NULL
GROUP BY c."workspaceId", cm."userId"
ON CONFLICT ("workspaceId", "userId") DO NOTHING;

UPDATE "WorkspaceMember"
SET "role" = 'OWNER'
WHERE "workspaceId" = 'workspace-migrado'
  AND "userId" = (
      SELECT "userId"
      FROM "WorkspaceMember"
      WHERE "workspaceId" = 'workspace-migrado'
      ORDER BY "joinedAt", "userId"
      LIMIT 1
  );

INSERT INTO "Team" ("id", "workspaceId", "name", "slug", "description", "createdAt", "updatedAt")
SELECT 'team-default-' || w."id", w."id", 'AKR Brands', 'akr-brands', 'Equipes e canais da organização.', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP
FROM "Workspace" w;

WITH legacy_channels AS (
    SELECT
        c."id",
        c."workspaceId",
        c."name",
        c."description",
        c."isPrivate",
        c."createdAt",
        c."updatedAt",
        COALESCE(NULLIF(trim(BOTH '-' FROM regexp_replace(lower(c."name"), '[^a-z0-9]+', '-', 'g')), ''), 'canal') AS base_slug
    FROM "Conversation" c
    WHERE c."type" = 'CHANNEL' AND c."workspaceId" IS NOT NULL
), ranked_channels AS (
    SELECT
        legacy_channels.*,
        row_number() OVER (PARTITION BY "workspaceId", "base_slug" ORDER BY "createdAt", "id") AS duplicate_number
    FROM legacy_channels
)
INSERT INTO "Channel" (
    "id", "teamId", "name", "slug", "description", "visibility", "createdAt", "updatedAt"
)
SELECT
    "id",
    'team-default-' || "workspaceId",
    "name",
    CASE WHEN "duplicate_number" = 1 THEN "base_slug" ELSE "base_slug" || '-' || "duplicate_number" END,
    "description",
    CASE WHEN "isPrivate" THEN 'PRIVATE'::"ChannelVisibility" ELSE 'PUBLIC'::"ChannelVisibility" END,
    "createdAt",
    "updatedAt"
FROM ranked_channels;

INSERT INTO "TeamMember" ("teamId", "userId", "joinedAt")
SELECT 'team-default-' || c."workspaceId", cm."userId", MIN(cm."joinedAt")
FROM "Conversation" c
JOIN "ConversationMember" cm ON cm."conversationId" = c."id"
WHERE c."type" = 'CHANNEL' AND c."workspaceId" IS NOT NULL
GROUP BY c."workspaceId", cm."userId"
ON CONFLICT ("teamId", "userId") DO NOTHING;

INSERT INTO "TeamMember" ("teamId", "userId", "joinedAt")
SELECT 'team-default-' || wm."workspaceId", wm."userId", wm."joinedAt"
FROM "WorkspaceMember" wm
WHERE wm."role" IN ('OWNER', 'ADMIN')
ON CONFLICT ("teamId", "userId") DO NOTHING;

INSERT INTO "ChannelMember" ("channelId", "userId", "joinedAt")
SELECT c."id", cm."userId", cm."joinedAt"
FROM "Conversation" c
JOIN "ConversationMember" cm ON cm."conversationId" = c."id"
WHERE c."type" = 'CHANNEL' AND c."workspaceId" IS NOT NULL
ON CONFLICT ("channelId", "userId") DO NOTHING;

WITH new_general_channels AS (
    INSERT INTO "Channel" (
        "id", "teamId", "name", "slug", "description", "visibility", "createdAt", "updatedAt"
    )
    SELECT
        'channel-general-' || w."id",
        'team-default-' || w."id",
        'geral',
        'geral',
        'Avisos e alinhamentos gerais da organização.',
        'PUBLIC',
        CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP
    FROM "Workspace" w
    WHERE NOT EXISTS (
        SELECT 1 FROM "Channel" ch
        WHERE ch."teamId" = 'team-default-' || w."id" AND ch."slug" = 'geral'
    )
    RETURNING "teamId"
)
INSERT INTO "TeamMember" ("teamId", "userId", "joinedAt")
SELECT ngc."teamId", wm."userId", wm."joinedAt"
FROM new_general_channels ngc
JOIN "WorkspaceMember" wm ON wm."workspaceId" = substring(ngc."teamId" FROM length('team-default-') + 1)
ON CONFLICT ("teamId", "userId") DO NOTHING;

UPDATE "Message" m
SET "channelId" = c."id", "conversationId" = NULL
FROM "Conversation" c
WHERE m."conversationId" = c."id" AND c."type" = 'CHANNEL';

DELETE FROM "ConversationMember" cm
USING "Conversation" c
WHERE cm."conversationId" = c."id" AND c."type" = 'CHANNEL';

DELETE FROM "Conversation" WHERE "type" = 'CHANNEL';

ALTER TABLE "Message"
ALTER COLUMN "conversationId" DROP NOT NULL;

ALTER TABLE "Message"
ADD CONSTRAINT "Message_exactly_one_target_check"
CHECK (("conversationId" IS NOT NULL) <> ("channelId" IS NOT NULL));

CREATE UNIQUE INDEX "Team_workspaceId_slug_key" ON "Team"("workspaceId", "slug");
CREATE INDEX "Team_workspaceId_archivedAt_idx" ON "Team"("workspaceId", "archivedAt");
CREATE INDEX "TeamMember_userId_idx" ON "TeamMember"("userId");
CREATE UNIQUE INDEX "Channel_teamId_slug_key" ON "Channel"("teamId", "slug");
CREATE INDEX "Channel_teamId_visibility_archivedAt_idx" ON "Channel"("teamId", "visibility", "archivedAt");
CREATE INDEX "ChannelMember_userId_idx" ON "ChannelMember"("userId");
CREATE INDEX "ChannelPreference_userId_favorite_hidden_idx" ON "ChannelPreference"("userId", "favorite", "hidden");
CREATE UNIQUE INDEX "WorkspaceInvite_tokenHash_key" ON "WorkspaceInvite"("tokenHash");
CREATE INDEX "WorkspaceInvite_workspaceId_email_acceptedAt_canceledAt_idx" ON "WorkspaceInvite"("workspaceId", "email", "acceptedAt", "canceledAt");
CREATE INDEX "WorkspaceInvite_expiresAt_idx" ON "WorkspaceInvite"("expiresAt");
CREATE INDEX "Message_channelId_createdAt_idx" ON "Message"("channelId", "createdAt");

ALTER TABLE "Team" ADD CONSTRAINT "Team_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_teamId_fkey"
FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TeamMember" ADD CONSTRAINT "TeamMember_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Channel" ADD CONSTRAINT "Channel_teamId_fkey"
FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChannelMember" ADD CONSTRAINT "ChannelMember_channelId_fkey"
FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChannelMember" ADD CONSTRAINT "ChannelMember_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ChannelPreference" ADD CONSTRAINT "ChannelPreference_channelId_fkey"
FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "ChannelPreference" ADD CONSTRAINT "ChannelPreference_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "WorkspaceInvite" ADD CONSTRAINT "WorkspaceInvite_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkspaceInvite" ADD CONSTRAINT "WorkspaceInvite_teamId_fkey"
FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "WorkspaceInvite" ADD CONSTRAINT "WorkspaceInvite_invitedById_fkey"
FOREIGN KEY ("invitedById") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "WorkspaceInvite" ADD CONSTRAINT "WorkspaceInvite_acceptedById_fkey"
FOREIGN KEY ("acceptedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Message" ADD CONSTRAINT "Message_channelId_fkey"
FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "Conversation" DROP CONSTRAINT "Conversation_workspaceId_fkey";
DROP INDEX "Conversation_workspaceId_type_idx";
ALTER TABLE "Conversation" DROP COLUMN "workspaceId";
ALTER TABLE "Conversation" DROP COLUMN "isPrivate";

ALTER TYPE "ConversationType" RENAME TO "ConversationType_old";
CREATE TYPE "ConversationType" AS ENUM ('DIRECT', 'GROUP');
ALTER TABLE "Conversation" ALTER COLUMN "type" TYPE "ConversationType"
USING ("type"::text::"ConversationType");
DROP TYPE "ConversationType_old";
