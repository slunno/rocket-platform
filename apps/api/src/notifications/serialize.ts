type ActivityNotificationRecord = {
  id: string;
  kind: 'MENTION' | 'REPLY' | 'REACTION' | 'INVITE' | 'EVENT_REMINDER';
  createdAt: Date;
  readAt: Date | null;
  workspaceId: string | null;
  conversationId: string | null;
  channelId: string | null;
  actor: { displayName: string } | null;
  workspace: { name: string } | null;
  conversation: { id: string; name: string } | null;
  channel: { id: string; name: string; teamId: string } | null;
};

export function serializeActivityNotification(notification: ActivityNotificationRecord) {
  return {
    id: notification.id,
    kind: notification.kind,
    actorName: notification.actor?.displayName ?? 'Uma pessoa',
    workspaceName: notification.workspace?.name ?? null,
    createdAt: notification.createdAt.toISOString(),
    readAt: notification.readAt?.toISOString() ?? null,
    target: notification.conversation
      ? { type: 'conversation' as const, id: notification.conversation.id }
      : notification.channel
        ? {
            type: 'channel' as const,
            id: notification.channel.id,
            teamId: notification.channel.teamId,
          }
        : notification.workspaceId
          ? { type: 'workspace' as const, id: notification.workspaceId }
          : null,
    conversationName: notification.conversation?.name ?? null,
    channelName: notification.channel?.name ?? null,
  };
}
