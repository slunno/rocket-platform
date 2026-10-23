CREATE TYPE "NotificationKind" AS ENUM ('MENTION', 'REPLY', 'REACTION', 'INVITE');

CREATE TYPE "NotificationLevel" AS ENUM ('ALL', 'MENTIONS', 'MUTED');

ALTER TABLE "ChannelPreference"
ADD COLUMN "notificationLevel" "NotificationLevel" NOT NULL DEFAULT 'ALL';

ALTER TABLE "ConversationMember"
ADD COLUMN "notificationLevel" "NotificationLevel" NOT NULL DEFAULT 'ALL';

CREATE TABLE "ActivityNotification" (
    "id" TEXT NOT NULL,
    "recipientId" TEXT NOT NULL,
    "actorId" TEXT,
    "kind" "NotificationKind" NOT NULL,
    "sourceKey" TEXT NOT NULL,
    "workspaceId" TEXT,
    "conversationId" TEXT,
    "channelId" TEXT,
    "messageId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "readAt" TIMESTAMP(3),

    CONSTRAINT "ActivityNotification_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ActivityNotification_recipientId_sourceKey_key"
ON "ActivityNotification"("recipientId", "sourceKey");

CREATE INDEX "ActivityNotification_recipientId_createdAt_idx"
ON "ActivityNotification"("recipientId", "createdAt");

CREATE INDEX "ActivityNotification_recipientId_readAt_createdAt_idx"
ON "ActivityNotification"("recipientId", "readAt", "createdAt");

ALTER TABLE "ActivityNotification"
ADD CONSTRAINT "ActivityNotification_recipientId_fkey"
FOREIGN KEY ("recipientId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ActivityNotification"
ADD CONSTRAINT "ActivityNotification_actorId_fkey"
FOREIGN KEY ("actorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "ActivityNotification"
ADD CONSTRAINT "ActivityNotification_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ActivityNotification"
ADD CONSTRAINT "ActivityNotification_conversationId_fkey"
FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ActivityNotification"
ADD CONSTRAINT "ActivityNotification_channelId_fkey"
FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ActivityNotification"
ADD CONSTRAINT "ActivityNotification_messageId_fkey"
FOREIGN KEY ("messageId") REFERENCES "Message"("id") ON DELETE CASCADE ON UPDATE CASCADE;

CREATE TABLE "PushSubscription" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "endpoint" TEXT NOT NULL,
    "p256dh" TEXT NOT NULL,
    "auth" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "PushSubscription_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "PushSubscription_endpoint_key" ON "PushSubscription"("endpoint");

CREATE INDEX "PushSubscription_userId_idx" ON "PushSubscription"("userId");

ALTER TABLE "PushSubscription"
ADD CONSTRAINT "PushSubscription_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
