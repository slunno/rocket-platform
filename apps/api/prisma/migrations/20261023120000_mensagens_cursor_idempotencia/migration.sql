ALTER TABLE "Message" ADD COLUMN "clientMessageId" UUID;

CREATE UNIQUE INDEX "Message_conversationId_authorId_clientMessageId_key"
ON "Message"("conversationId", "authorId", "clientMessageId");

CREATE UNIQUE INDEX "Message_channelId_authorId_clientMessageId_key"
ON "Message"("channelId", "authorId", "clientMessageId");
