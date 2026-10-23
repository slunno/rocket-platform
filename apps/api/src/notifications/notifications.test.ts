import { describe, expect, it } from 'vitest';
import {
  activityQuerySchema,
  channelPreferenceInputSchema,
  conversationPreferenceInputSchema,
  pushSubscriptionInputSchema,
} from '@rocket/shared';
import { shouldCreateActivityNotification } from './preferences.js';
import { serializeActivityNotification } from './serialize.js';

describe('preferências de notificações', () => {
  it('aceita níveis de notificação em preferências individuais', () => {
    expect(conversationPreferenceInputSchema.parse({ notificationLevel: 'MENTIONS' })).toEqual({
      notificationLevel: 'MENTIONS',
    });
    expect(channelPreferenceInputSchema.parse({ notificationLevel: 'MUTED' })).toEqual({
      notificationLevel: 'MUTED',
    });
  });

  it('respeita o nível configurado para cada tipo de atividade', () => {
    expect(shouldCreateActivityNotification('REACTION', 'ALL')).toBe(true);
    expect(shouldCreateActivityNotification('REPLY', 'MENTIONS')).toBe(false);
    expect(shouldCreateActivityNotification('MENTION', 'MENTIONS')).toBe(true);
    expect(shouldCreateActivityNotification('MENTION', 'ALL', true)).toBe(false);
    expect(shouldCreateActivityNotification('INVITE', 'MUTED')).toBe(false);
  });

  it('valida filtros e cursores do feed', () => {
    expect(activityQuerySchema.parse({ filter: 'mentions', limit: '20' })).toMatchObject({
      filter: 'mentions',
      limit: 20,
    });
    expect(activityQuerySchema.safeParse({ filter: 'everything' }).success).toBe(false);
  });

  it('aceita apenas assinaturas Web Push HTTPS com chaves presentes', () => {
    expect(
      pushSubscriptionInputSchema.safeParse({
        endpoint: 'https://fcm.googleapis.com/fcm/send/example',
        keys: { p256dh: 'p'.repeat(32), auth: 'a'.repeat(16) },
      }).success,
    ).toBe(true);
    expect(
      pushSubscriptionInputSchema.safeParse({
        endpoint: 'http://fcm.googleapis.com/fcm/send/example',
        keys: { p256dh: 'p'.repeat(32), auth: 'a'.repeat(16) },
      }).success,
    ).toBe(false);
  });
});

describe('serialização da atividade', () => {
  it('expõe o destino autorizado sem serializar mensagem ou campos internos', () => {
    const serialized = serializeActivityNotification({
      id: 'activity-1',
      kind: 'MENTION',
      createdAt: new Date('2026-10-23T12:00:00.000Z'),
      readAt: null,
      workspaceId: 'workspace-1',
      conversationId: null,
      channelId: 'channel-1',
      actor: { displayName: 'Ana' },
      workspace: { name: 'AKR Brands' },
      conversation: null,
      channel: { id: 'channel-1', name: 'Produto', teamId: 'team-1' },
    });
    expect(serialized).toMatchObject({
      actorName: 'Ana',
      target: { type: 'channel', id: 'channel-1', teamId: 'team-1' },
      channelName: 'Produto',
    });
    expect(JSON.stringify(serialized)).not.toContain('storageKey');
    expect(JSON.stringify(serialized)).not.toContain('message text');
  });
});
