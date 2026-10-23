import webpush from 'web-push';
import { env } from '../env.js';

export const webPushConfigured = Boolean(
  env.VAPID_PUBLIC_KEY && env.VAPID_PRIVATE_KEY && env.VAPID_SUBJECT,
);

if (webPushConfigured) {
  webpush.setVapidDetails(env.VAPID_SUBJECT!, env.VAPID_PUBLIC_KEY!, env.VAPID_PRIVATE_KEY!);
}

export function sendWebPush(
  subscription: { endpoint: string; keys: { p256dh: string; auth: string } },
  payload: string,
) {
  if (!webPushConfigured) return Promise.resolve();
  return webpush.sendNotification(subscription, payload, {
    TTL: 60,
    urgency: 'normal',
  });
}
