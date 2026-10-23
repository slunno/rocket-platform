CREATE INDEX "Message_search_vector_idx"
ON "Message"
USING GIN (to_tsvector('portuguese', "text"))
WHERE "deletedAt" IS NULL;

CREATE INDEX "User_search_vector_idx"
ON "User"
USING GIN (
  to_tsvector(
    'portuguese',
    coalesce("displayName", '') || ' ' || coalesce("username", '') || ' ' || coalesce("jobTitle", '')
  )
);

CREATE INDEX "Channel_search_vector_idx"
ON "Channel"
USING GIN (
  to_tsvector(
    'portuguese',
    coalesce("name", '') || ' ' || coalesce("description", '')
  )
)
WHERE "archivedAt" IS NULL;

CREATE INDEX "Attachment_search_vector_idx"
ON "Attachment"
USING GIN (to_tsvector('portuguese', "fileName"))
WHERE "uploadedAt" IS NOT NULL;
