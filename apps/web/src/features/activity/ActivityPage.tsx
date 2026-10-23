import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, BellOff, CheckCheck, ExternalLink } from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import {
  getActivity,
  deletePushSubscription,
  getPushConfiguration,
  markActivityRead,
  markAllActivityRead,
  savePushSubscription,
  type RemoteActivityItem,
} from '../../api';

type Filter = 'all' | 'unread' | 'mentions';

function decodeVapidPublicKey(value: string) {
  const padded = value.padEnd(value.length + ((4 - (value.length % 4)) % 4), '=');
  const binary = window.atob(padded.replace(/-/g, '+').replace(/_/g, '/'));
  return Uint8Array.from(binary, (character) => character.charCodeAt(0));
}

function activityText(item: RemoteActivityItem) {
  const location = item.channelName
    ? ` em #${item.channelName}`
    : item.conversationName
      ? ` em ${item.conversationName}`
      : '';
  switch (item.kind) {
    case 'MENTION':
      return `${item.actorName} mencionou você${location}.`;
    case 'REPLY':
      return `${item.actorName} respondeu ao seu tópico${location}.`;
    case 'REACTION':
      return `${item.actorName} reagiu à sua mensagem${location}.`;
    case 'INVITE':
      return `${item.actorName} aceitou seu convite para ${item.workspaceName ?? 'o espaço'}.`;
  }
}

function targetPath(item: RemoteActivityItem) {
  if (item.target?.type === 'conversation') return `/chat/${encodeURIComponent(item.target.id)}`;
  if (item.target?.type === 'channel') {
    return `/equipes/${encodeURIComponent(item.target.teamId)}/${encodeURIComponent(item.target.id)}`;
  }
  return '/chat/produto';
}

function activityDate(value: string) {
  return new Intl.DateTimeFormat('pt-BR', {
    dateStyle: 'medium',
    timeStyle: 'short',
  }).format(new Date(value));
}

export function ActivityPage() {
  const { accessToken: token } = useAuth();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<Filter>('all');
  const [items, setItems] = useState<RemoteActivityItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [browserNotifications, setBrowserNotifications] = useState(() => {
    try {
      return window.localStorage.getItem('rocket.browser-notifications') === 'enabled';
    } catch {
      return false;
    }
  });

  const load = useCallback(
    async (selectedFilter: Filter, cursor?: string, append = false) => {
      if (!token) return;
      setError('');
      if (!append) setLoading(true);
      try {
        const result = await getActivity(token, selectedFilter, cursor);
        setItems((current) =>
          append
            ? [
                ...current,
                ...result.items.filter((item) => !current.some(({ id }) => id === item.id)),
              ]
            : result.items,
        );
        setNextCursor(result.nextCursor);
        setUnreadCount(result.unreadCount);
      } catch (caught) {
        setError(
          caught instanceof Error ? caught.message : 'Não foi possível carregar a atividade.',
        );
      } finally {
        setLoading(false);
      }
    },
    [token],
  );

  useEffect(() => {
    void load(filter);
  }, [filter, load]);

  useEffect(() => {
    const refresh = () => void load(filter);
    window.addEventListener('rocket:activity-updated', refresh);
    return () => window.removeEventListener('rocket:activity-updated', refresh);
  }, [filter, load]);

  const openActivity = async (item: RemoteActivityItem) => {
    if (!token) return;
    if (!item.readAt) {
      try {
        await markActivityRead(token, item.id);
        setItems((current) =>
          current.map((entry) =>
            entry.id === item.id ? { ...entry, readAt: new Date().toISOString() } : entry,
          ),
        );
        setUnreadCount((count) => Math.max(0, count - 1));
        window.dispatchEvent(new Event('rocket:activity-updated'));
      } catch {
        setError('Não foi possível marcar a atividade como lida.');
      }
    }
    navigate(targetPath(item));
  };

  const markAllRead = async () => {
    if (!token) return;
    setBusy(true);
    setError('');
    try {
      await markAllActivityRead(token);
      const now = new Date().toISOString();
      setItems((current) => current.map((item) => ({ ...item, readAt: item.readAt ?? now })));
      setUnreadCount(0);
      window.dispatchEvent(new Event('rocket:activity-updated'));
    } catch {
      setError('Não foi possível marcar todas as atividades como lidas.');
    } finally {
      setBusy(false);
    }
  };

  const enableBrowserNotifications = async () => {
    if (!token || !('Notification' in window)) {
      setError('Este navegador não oferece notificações de desktop.');
      return;
    }
    try {
      const permission =
        Notification.permission === 'granted' ? 'granted' : await Notification.requestPermission();
      if (permission !== 'granted') {
        window.localStorage.setItem('rocket.browser-notifications', 'disabled');
        setBrowserNotifications(false);
        setError('A permissão de notificações foi negada no navegador.');
        return;
      }

      const pushConfig = await getPushConfiguration(token);
      if (
        pushConfig.enabled &&
        pushConfig.publicKey &&
        'serviceWorker' in navigator &&
        'PushManager' in window
      ) {
        const registration = await navigator.serviceWorker.register('/service-worker.js');
        const readyRegistration = await navigator.serviceWorker.ready;
        const subscription =
          (await readyRegistration.pushManager.getSubscription()) ??
          (await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: decodeVapidPublicKey(pushConfig.publicKey),
          }));
        const serialized = subscription.toJSON();
        if (!serialized.endpoint || !serialized.keys?.p256dh || !serialized.keys.auth) {
          throw new Error('A assinatura do navegador não contém as chaves necessárias.');
        }
        await savePushSubscription(token, {
          endpoint: serialized.endpoint,
          keys: { p256dh: serialized.keys.p256dh, auth: serialized.keys.auth },
        });
        window.localStorage.setItem('rocket.browser-push', 'enabled');
      } else {
        window.localStorage.removeItem('rocket.browser-push');
      }
      window.localStorage.setItem('rocket.browser-notifications', 'enabled');
      setBrowserNotifications(true);
      setError('');
    } catch {
      setError('Não foi possível ativar as notificações do navegador.');
    }
  };

  const disableBrowserNotifications = async () => {
    if (token && 'serviceWorker' in navigator) {
      try {
        const registration = await navigator.serviceWorker.getRegistration('/');
        const subscription = await registration?.pushManager.getSubscription();
        if (subscription) {
          const serialized = subscription.toJSON();
          if (serialized.endpoint && serialized.keys?.p256dh && serialized.keys.auth) {
            await deletePushSubscription(token, {
              endpoint: serialized.endpoint,
              keys: { p256dh: serialized.keys.p256dh, auth: serialized.keys.auth },
            });
          }
          await subscription.unsubscribe();
        }
      } catch {
        setError('Não foi possível remover a assinatura Push do navegador.');
        return;
      }
    }
    window.localStorage.removeItem('rocket.browser-push');
    window.localStorage.setItem('rocket.browser-notifications', 'disabled');
    setBrowserNotifications(false);
  };

  return (
    <section className="activity-page" aria-labelledby="activity-title">
      <header className="activity-page-header">
        <div>
          <span className="eyebrow">ROCKET</span>
          <h1 id="activity-title">Atividade</h1>
          <p>Menções, respostas, reações e atualizações importantes do seu espaço.</p>
        </div>
        <div className="activity-header-actions">
          <button
            type="button"
            className="button button-secondary"
            onClick={() =>
              void (browserNotifications
                ? disableBrowserNotifications()
                : enableBrowserNotifications())
            }
          >
            {browserNotifications ? <Bell size={16} /> : <BellOff size={16} />}
            {browserNotifications ? 'Desativar notificações' : 'Ativar no navegador'}
          </button>
          <button
            type="button"
            className="button button-secondary"
            onClick={() => void markAllRead()}
            disabled={busy || unreadCount === 0}
          >
            <CheckCheck size={16} aria-hidden="true" /> Marcar tudo como lido
          </button>
        </div>
      </header>

      <div className="activity-filter-row" role="tablist" aria-label="Filtrar atividade">
        {(
          [
            ['all', 'Tudo'],
            ['unread', 'Não lido'],
            ['mentions', 'Menções'],
          ] as const
        ).map(([value, label]) => (
          <button
            key={value}
            type="button"
            role="tab"
            aria-selected={filter === value}
            className={
              filter === value ? 'activity-filter activity-filter-active' : 'activity-filter'
            }
            onClick={() => setFilter(value)}
          >
            {label}
            {value === 'unread' && unreadCount > 0 && (
              <span className="activity-unread-count">{unreadCount}</span>
            )}
          </button>
        ))}
      </div>

      {error && (
        <p className="activity-error" role="alert">
          {error}
        </p>
      )}
      {loading ? (
        <p className="activity-feedback" role="status">
          Carregando atividade…
        </p>
      ) : items.length ? (
        <div className="activity-list" aria-live="polite">
          {items.map((item) => (
            <article
              className={`activity-card ${item.readAt ? '' : 'activity-card-unread'}`}
              key={item.id}
            >
              <span className="activity-card-marker" aria-hidden="true" />
              <div className="activity-card-copy">
                <p>{activityText(item)}</p>
                <time dateTime={item.createdAt}>{activityDate(item.createdAt)}</time>
              </div>
              <button
                type="button"
                className="activity-open-button"
                onClick={() => void openActivity(item)}
                aria-label={`Abrir atividade: ${activityText(item)}`}
              >
                Abrir <ExternalLink size={14} aria-hidden="true" />
              </button>
            </article>
          ))}
          {nextCursor && (
            <button
              type="button"
              className="button button-secondary activity-load-more"
              onClick={() => void load(filter, nextCursor, true)}
              disabled={loading}
            >
              Carregar mais
            </button>
          )}
        </div>
      ) : (
        <div className="activity-empty">
          <Bell size={24} aria-hidden="true" />
          <h2>Nenhuma atividade por enquanto</h2>
          <p>
            Quando alguém mencionar você, responder ao seu tópico ou reagir à sua mensagem,
            aparecerá aqui.
          </p>
        </div>
      )}
    </section>
  );
}
