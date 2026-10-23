import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { io } from 'socket.io-client';
import { PRESENCE_HEARTBEAT_INTERVAL_MS, socketEvents } from '@rocket/shared';
import { type RemoteActivityItem } from '../../api';
import { useAuth } from '../../auth/AuthContext';

const API_URL = import.meta.env.VITE_API_URL || 'http://localhost:4000';

function notificationText(item: RemoteActivityItem) {
  if (item.kind === 'MENTION') return `${item.actorName} mencionou você.`;
  if (item.kind === 'REPLY') return `${item.actorName} respondeu ao seu tópico.`;
  if (item.kind === 'REACTION') return `${item.actorName} reagiu à sua mensagem.`;
  return `${item.actorName} aceitou seu convite para ${item.workspaceName ?? 'o espaço'}.`;
}

function notificationPath(item: RemoteActivityItem) {
  if (item.target?.type === 'conversation') return `/chat/${encodeURIComponent(item.target.id)}`;
  if (item.target?.type === 'channel') {
    return `/equipes/${encodeURIComponent(item.target.teamId)}/${encodeURIComponent(item.target.id)}`;
  }
  return '/atividade';
}

export function NotificationBridge() {
  const { accessToken, user } = useAuth();
  const navigate = useNavigate();
  const [latest, setLatest] = useState<RemoteActivityItem | null>(null);
  const lastId = useRef<string | null>(null);

  useEffect(() => {
    if (!accessToken) return;
    const socket = io(API_URL, {
      auth: { token: accessToken },
      transports: ['websocket', 'polling'],
    });
    const heartbeat = () => {
      if (socket.connected) socket.emit(socketEvents.presenceHeartbeat);
    };
    socket.on('connect', heartbeat);
    const heartbeatTimer = window.setInterval(heartbeat, PRESENCE_HEARTBEAT_INTERVAL_MS);
    const handleNotification = (item: RemoteActivityItem) => {
      if (lastId.current === item.id) return;
      lastId.current = item.id;
      window.dispatchEvent(new Event('rocket:activity-updated'));
      if (user?.status === 'DO_NOT_DISTURB') return;
      setLatest(item);
      try {
        if (
          window.localStorage.getItem('rocket.browser-notifications') === 'enabled' &&
          window.localStorage.getItem('rocket.browser-push') !== 'enabled' &&
          'Notification' in window &&
          Notification.permission === 'granted'
        ) {
          const browserNotification = new Notification('Rocket', {
            body: notificationText(item),
            tag: item.id,
          });
          browserNotification.onclick = () => {
            window.focus();
            navigate(notificationPath(item));
            browserNotification.close();
          };
        }
      } catch {
        // A restrição do navegador a notificações locais não deve afetar o feed nem o toast do app.
      }
    };
    socket.on(socketEvents.notificationCreated, handleNotification);
    return () => {
      window.clearInterval(heartbeatTimer);
      socket.off('connect', heartbeat);
      socket.off(socketEvents.notificationCreated, handleNotification);
      socket.disconnect();
    };
  }, [accessToken, navigate, user?.status]);

  useEffect(() => {
    if (!latest) return;
    const timer = window.setTimeout(() => setLatest(null), 6_000);
    return () => window.clearTimeout(timer);
  }, [latest]);

  if (!latest) return null;
  return (
    <button
      type="button"
      className="activity-live-toast"
      role="status"
      aria-live="polite"
      onClick={() => {
        navigate(notificationPath(latest));
        setLatest(null);
      }}
    >
      <span>{notificationText(latest)}</span>
      <small>Abrir atividade</small>
    </button>
  );
}
