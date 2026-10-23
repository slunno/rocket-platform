import type { NotificationKind, NotificationLevel } from '../generated/prisma/client.js';

export function shouldCreateActivityNotification(
  kind: NotificationKind,
  notificationLevel: NotificationLevel,
  muted = false,
) {
  if (muted || notificationLevel === 'MUTED') return false;
  if (notificationLevel === 'MENTIONS') return kind === 'MENTION';
  return true;
}
