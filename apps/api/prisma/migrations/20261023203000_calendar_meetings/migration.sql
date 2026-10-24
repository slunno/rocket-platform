CREATE TYPE "CalendarRecurrence" AS ENUM ('NONE', 'DAILY', 'WEEKLY', 'MONTHLY');
CREATE TYPE "CalendarAttendeeStatus" AS ENUM ('INVITED', 'ACCEPTED', 'DECLINED');
ALTER TYPE "NotificationKind" ADD VALUE 'EVENT_REMINDER';

CREATE TABLE "CalendarEvent" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "startAt" TIMESTAMP(3) NOT NULL,
    "endAt" TIMESTAMP(3) NOT NULL,
    "timeZone" TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
    "recurrence" "CalendarRecurrence" NOT NULL DEFAULT 'NONE',
    "recurrenceUntil" TIMESTAMP(3),
    "reminderMinutes" INTEGER NOT NULL DEFAULT 15,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),
    CONSTRAINT "CalendarEvent_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CalendarEvent_workspaceId_startAt_endAt_idx"
ON "CalendarEvent"("workspaceId", "startAt", "endAt");
CREATE INDEX "CalendarEvent_workspaceId_recurrence_recurrenceUntil_idx"
ON "CalendarEvent"("workspaceId", "recurrence", "recurrenceUntil");

CREATE TABLE "CalendarEventAttendee" (
    "eventId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "status" "CalendarAttendeeStatus" NOT NULL DEFAULT 'INVITED',
    "respondedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CalendarEventAttendee_pkey" PRIMARY KEY ("eventId", "userId")
);

CREATE INDEX "CalendarEventAttendee_userId_status_idx"
ON "CalendarEventAttendee"("userId", "status");

CREATE TABLE "MeetingCall" (
    "id" TEXT NOT NULL,
    "workspaceId" TEXT NOT NULL,
    "conversationId" TEXT,
    "channelId" TEXT,
    "eventId" TEXT,
    "roomName" TEXT NOT NULL,
    "createdById" TEXT NOT NULL,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "endedAt" TIMESTAMP(3),
    CONSTRAINT "MeetingCall_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "MeetingCall_eventId_key" ON "MeetingCall"("eventId");
CREATE UNIQUE INDEX "MeetingCall_roomName_key" ON "MeetingCall"("roomName");
CREATE INDEX "MeetingCall_workspaceId_startedAt_idx" ON "MeetingCall"("workspaceId", "startedAt");
CREATE INDEX "MeetingCall_conversationId_startedAt_idx" ON "MeetingCall"("conversationId", "startedAt");
CREATE INDEX "MeetingCall_channelId_startedAt_idx" ON "MeetingCall"("channelId", "startedAt");

CREATE TABLE "CallParticipant" (
    "callId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "firstJoinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastJoinedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "leftAt" TIMESTAMP(3),
    CONSTRAINT "CallParticipant_pkey" PRIMARY KEY ("callId", "userId")
);

CREATE INDEX "CallParticipant_userId_lastJoinedAt_idx"
ON "CallParticipant"("userId", "lastJoinedAt");

ALTER TABLE "CalendarEvent"
ADD CONSTRAINT "CalendarEvent_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CalendarEvent"
ADD CONSTRAINT "CalendarEvent_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CalendarEventAttendee"
ADD CONSTRAINT "CalendarEventAttendee_eventId_fkey"
FOREIGN KEY ("eventId") REFERENCES "CalendarEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CalendarEventAttendee"
ADD CONSTRAINT "CalendarEventAttendee_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MeetingCall"
ADD CONSTRAINT "MeetingCall_workspaceId_fkey"
FOREIGN KEY ("workspaceId") REFERENCES "Workspace"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MeetingCall"
ADD CONSTRAINT "MeetingCall_conversationId_fkey"
FOREIGN KEY ("conversationId") REFERENCES "Conversation"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MeetingCall"
ADD CONSTRAINT "MeetingCall_channelId_fkey"
FOREIGN KEY ("channelId") REFERENCES "Channel"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MeetingCall"
ADD CONSTRAINT "MeetingCall_eventId_fkey"
FOREIGN KEY ("eventId") REFERENCES "CalendarEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MeetingCall"
ADD CONSTRAINT "MeetingCall_createdById_fkey"
FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "CallParticipant"
ADD CONSTRAINT "CallParticipant_callId_fkey"
FOREIGN KEY ("callId") REFERENCES "MeetingCall"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CallParticipant"
ADD CONSTRAINT "CallParticipant_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
