ALTER TABLE "Conversation"
ADD COLUMN "workspaceId" TEXT,
ADD COLUMN "directKey" TEXT,
ADD COLUMN "createdById" TEXT,
ADD COLUMN "avatarUrl" TEXT;

ALTER TABLE "ConversationMember"
ADD COLUMN "muted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "pinned" BOOLEAN NOT NULL DEFAULT false;

-- Unifica DMs antigas do mesmo par antes de impor a chave única.
WITH direct_pairs AS (
    SELECT
        c."id",
        c."createdAt",
        c."updatedAt",
        array_agg(cm."userId" ORDER BY cm."userId") AS members
    FROM "Conversation" c
    JOIN "ConversationMember" cm ON cm."conversationId" = c."id"
    WHERE c."type" = 'DIRECT'
    GROUP BY c."id", c."createdAt", c."updatedAt"
    HAVING count(*) = 2
), ranked_pairs AS (
    SELECT
        "id",
        "updatedAt",
        members,
        first_value("id") OVER (PARTITION BY members ORDER BY "createdAt", "id") AS canonical_id,
        row_number() OVER (PARTITION BY members ORDER BY "createdAt", "id") AS pair_rank
    FROM direct_pairs
), membership_rollup AS (
    SELECT
        ranked_pairs.canonical_id,
        cm."userId",
        min(cm."joinedAt") AS "joinedAt",
        CASE WHEN bool_or(cm."lastReadAt" IS NULL) THEN NULL ELSE min(cm."lastReadAt") END AS "lastReadAt",
        bool_or(cm."muted") AS muted,
        bool_or(cm."pinned") AS pinned
    FROM ranked_pairs
    JOIN "ConversationMember" cm ON cm."conversationId" = ranked_pairs."id"
    GROUP BY ranked_pairs.canonical_id, cm."userId"
)
UPDATE "ConversationMember" canonical_member
SET
    "joinedAt" = membership_rollup."joinedAt",
    "lastReadAt" = membership_rollup."lastReadAt",
    "muted" = membership_rollup.muted,
    "pinned" = membership_rollup.pinned
FROM membership_rollup
WHERE canonical_member."conversationId" = membership_rollup.canonical_id
  AND canonical_member."userId" = membership_rollup."userId";

WITH direct_pairs AS (
    SELECT
        c."id",
        c."createdAt",
        c."updatedAt",
        array_agg(cm."userId" ORDER BY cm."userId") AS members
    FROM "Conversation" c
    JOIN "ConversationMember" cm ON cm."conversationId" = c."id"
    WHERE c."type" = 'DIRECT'
    GROUP BY c."id", c."createdAt", c."updatedAt"
    HAVING count(*) = 2
), canonical_activity AS (
    SELECT
        first_value("id") OVER (PARTITION BY members ORDER BY "createdAt", "id") AS canonical_id,
        max("updatedAt") OVER (PARTITION BY members) AS latest_update,
        row_number() OVER (PARTITION BY members ORDER BY "createdAt", "id") AS pair_rank
    FROM direct_pairs
)
UPDATE "Conversation" conversation
SET "updatedAt" = canonical_activity.latest_update
FROM canonical_activity
WHERE conversation."id" = canonical_activity.canonical_id
  AND canonical_activity.pair_rank = 1;

WITH direct_pairs AS (
    SELECT
        c."id",
        c."createdAt",
        c."updatedAt",
        array_agg(cm."userId" ORDER BY cm."userId") AS members
    FROM "Conversation" c
    JOIN "ConversationMember" cm ON cm."conversationId" = c."id"
    WHERE c."type" = 'DIRECT'
    GROUP BY c."id", c."createdAt", c."updatedAt"
    HAVING count(*) = 2
), ranked_pairs AS (
    SELECT
        "id",
        first_value("id") OVER (PARTITION BY members ORDER BY "createdAt", "id") AS canonical_id,
        row_number() OVER (PARTITION BY members ORDER BY "createdAt", "id") AS pair_rank
    FROM direct_pairs
), duplicates AS (
    SELECT "id", canonical_id FROM ranked_pairs WHERE pair_rank > 1
)
UPDATE "Message" message
SET "clientMessageId" = NULL
FROM duplicates
WHERE message."conversationId" = duplicates."id"
  AND message."clientMessageId" IS NOT NULL;

WITH direct_pairs AS (
    SELECT
        c."id",
        c."createdAt",
        array_agg(cm."userId" ORDER BY cm."userId") AS members
    FROM "Conversation" c
    JOIN "ConversationMember" cm ON cm."conversationId" = c."id"
    WHERE c."type" = 'DIRECT'
    GROUP BY c."id", c."createdAt"
    HAVING count(*) = 2
), ranked_pairs AS (
    SELECT
        "id",
        first_value("id") OVER (PARTITION BY members ORDER BY "createdAt", "id") AS canonical_id,
        row_number() OVER (PARTITION BY members ORDER BY "createdAt", "id") AS pair_rank
    FROM direct_pairs
), duplicates AS (
    SELECT "id", canonical_id FROM ranked_pairs WHERE pair_rank > 1
)
UPDATE "Message" message
SET "conversationId" = duplicates.canonical_id
FROM duplicates
WHERE message."conversationId" = duplicates."id";

WITH direct_pairs AS (
    SELECT
        c."id",
        c."createdAt",
        array_agg(cm."userId" ORDER BY cm."userId") AS members
    FROM "Conversation" c
    JOIN "ConversationMember" cm ON cm."conversationId" = c."id"
    WHERE c."type" = 'DIRECT'
    GROUP BY c."id", c."createdAt"
    HAVING count(*) = 2
), ranked_pairs AS (
    SELECT
        "id",
        row_number() OVER (PARTITION BY members ORDER BY "createdAt", "id") AS pair_rank
    FROM direct_pairs
)
DELETE FROM "Conversation" conversation
USING ranked_pairs
WHERE conversation."id" = ranked_pairs."id"
  AND ranked_pairs.pair_rank > 1;

WITH direct_pairs AS (
    SELECT
        c."id",
        c."createdAt",
        array_agg(cm."userId" ORDER BY cm."userId") AS members
    FROM "Conversation" c
    JOIN "ConversationMember" cm ON cm."conversationId" = c."id"
    WHERE c."type" = 'DIRECT'
    GROUP BY c."id", c."createdAt"
    HAVING count(*) = 2
), ranked_pairs AS (
    SELECT
        "id",
        members,
        row_number() OVER (PARTITION BY members ORDER BY "createdAt", "id") AS pair_rank
    FROM direct_pairs
)
UPDATE "Conversation" conversation
SET "directKey" = ranked_pairs.members[1] || ':' || ranked_pairs.members[2]
FROM ranked_pairs
WHERE conversation."id" = ranked_pairs."id"
  AND ranked_pairs.pair_rank = 1;

CREATE UNIQUE INDEX "Conversation_directKey_key" ON "Conversation"("directKey");
CREATE INDEX "Conversation_workspaceId_type_updatedAt_idx" ON "Conversation"("workspaceId", "type", "updatedAt");

ALTER TABLE "Conversation"
ADD CONSTRAINT "Conversation_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Conversation"
ADD CONSTRAINT "Conversation_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
