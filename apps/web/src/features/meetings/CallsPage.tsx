import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
import {
  Camera,
  CameraOff,
  ChevronDown,
  Headphones,
  MessageCircle,
  Mic,
  MicOff,
  MonitorUp,
  Phone,
  PhoneOff,
  Send,
  Users,
  Video,
  X,
} from 'lucide-react';
import {
  Room,
  RoomEvent,
  Track,
  type RemoteParticipant,
  type RemoteTrack,
  type RemoteTrackPublication,
} from 'livekit-client';
import { useAuth } from '../../auth/AuthContext';
import {
  endCall,
  getCallHistory,
  getConversations,
  getWorkspace,
  getWorkspaces,
  joinActiveCall,
  joinCalendarMeeting,
  leaveCall,
  startChannelCall,
  startDirectCall,
  type RemoteCallHistoryItem,
  type RemoteChannel,
  type RemoteConversation,
  type RemoteMeetingCredentials,
  type RemoteWorkspace,
} from '../../api';

type MeetingMessage = { id: string; sender: string; text: string; sentAt: string };
type ParticipantStatus = { id: string; name: string; handRaised: boolean };

function dateLabel(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { dateStyle: 'medium', timeStyle: 'short' }).format(
    new Date(value),
  );
}

function MeetingLobby({
  title,
  onJoin,
  onLeave,
}: {
  title: string;
  onJoin: (settings: { microphoneEnabled: boolean; cameraEnabled: boolean }) => void;
  onLeave: () => void;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const [microphoneEnabled, setMicrophoneEnabled] = useState(true);
  const [cameraEnabled, setCameraEnabled] = useState(false);
  const [error, setError] = useState('');

  useEffect(
    () => () => {
      streamRef.current?.getTracks().forEach((track) => track.stop());
    },
    [],
  );

  useEffect(() => {
    if (videoRef.current && streamRef.current) videoRef.current.srcObject = streamRef.current;
  }, [cameraEnabled]);

  const toggleCamera = async () => {
    if (cameraEnabled) {
      streamRef.current?.getTracks().forEach((track) => track.stop());
      streamRef.current = null;
      setCameraEnabled(false);
      return;
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: false });
      streamRef.current = stream;
      if (videoRef.current) videoRef.current.srcObject = stream;
      setCameraEnabled(true);
      setError('');
    } catch {
      setError('Não foi possível acessar a câmera. Você pode continuar sem vídeo.');
    }
  };

  return (
    <main className="meeting-lobby" aria-labelledby="meeting-lobby-title">
      <section className="meeting-lobby-card">
        <div className="meeting-lobby-preview">
          {cameraEnabled ? (
            <video ref={videoRef} autoPlay muted playsInline aria-label="Prévia da câmera" />
          ) : (
            <Video size={32} aria-hidden="true" />
          )}
        </div>
        <span className="eyebrow">ANTES DE ENTRAR</span>
        <h1 id="meeting-lobby-title">{title}</h1>
        <p>Confira seu áudio e vídeo. A câmera fica desligada até você escolher ativá-la.</p>
        {error && (
          <p role="alert" className="activity-error">
            {error}
          </p>
        )}
        <div className="meeting-lobby-controls">
          <button
            type="button"
            className={`meeting-control ${microphoneEnabled ? '' : 'meeting-control-muted'}`}
            onClick={() => setMicrophoneEnabled((enabled) => !enabled)}
            aria-pressed={microphoneEnabled}
          >
            {microphoneEnabled ? <Mic size={19} /> : <MicOff size={19} />}
            <span>{microphoneEnabled ? 'Microfone ligado' : 'Microfone desligado'}</span>
          </button>
          <button
            type="button"
            className={`meeting-control ${cameraEnabled ? '' : 'meeting-control-muted'}`}
            onClick={() => void toggleCamera()}
            aria-pressed={cameraEnabled}
          >
            {cameraEnabled ? <Camera size={19} /> : <CameraOff size={19} />}
            <span>{cameraEnabled ? 'Câmera ligada' : 'Câmera desligada'}</span>
          </button>
        </div>
        <footer>
          <button type="button" className="button button-secondary" onClick={onLeave}>
            Cancelar
          </button>
          <button
            type="button"
            className="button button-primary"
            onClick={() => onJoin({ microphoneEnabled, cameraEnabled })}
          >
            <Video size={16} />
            Entrar na reunião
          </button>
        </footer>
      </section>
    </main>
  );
}

function MeetingRoom({
  credentials,
  userId,
  initialMicrophoneEnabled,
  initialCameraEnabled,
  onLeave,
}: {
  credentials: RemoteMeetingCredentials;
  userId: string;
  initialMicrophoneEnabled: boolean;
  initialCameraEnabled: boolean;
  onLeave: () => void;
}) {
  const mediaRootRef = useRef<HTMLDivElement>(null);
  const roomRef = useRef<Room | null>(null);
  const [connection, setConnection] = useState<'connecting' | 'connected' | 'error'>('connecting');
  const [error, setError] = useState('');
  const [microphoneEnabled, setMicrophoneEnabled] = useState(initialMicrophoneEnabled);
  const [cameraEnabled, setCameraEnabled] = useState(initialCameraEnabled);
  const [screenShareEnabled, setScreenShareEnabled] = useState(false);
  const [chatOpen, setChatOpen] = useState(false);
  const [chatText, setChatText] = useState('');
  const [messages, setMessages] = useState<MeetingMessage[]>([]);
  const [participants, setParticipants] = useState<ParticipantStatus[]>([]);

  const refreshParticipants = useCallback((room: Room) => {
    const current = [room.localParticipant, ...room.remoteParticipants.values()];
    setParticipants((previous) => {
      const previousById = new Map(previous.map((participant) => [participant.id, participant]));
      return current.map((participant) => ({
        id: participant.identity,
        name: participant.name || participant.identity,
        handRaised: previousById.get(participant.identity)?.handRaised ?? false,
      }));
    });
  }, []);

  useEffect(() => {
    const room = new Room({ adaptiveStream: true, dynacast: true });
    roomRef.current = room;
    const attachedTracks = new Map<string, { track: RemoteTrack; element: HTMLElement }>();
    let active = true;

    const attachTrack = (
      track: RemoteTrack,
      _publication: RemoteTrackPublication,
      participant: RemoteParticipant,
    ) => {
      const root = mediaRootRef.current;
      if (!root || !track.sid) return;
      const key = `${participant.identity}:${track.sid}`;
      if (attachedTracks.has(key)) return;
      const element = document.createElement(track.kind === Track.Kind.Video ? 'div' : 'audio');
      element.dataset.livekitTrack = key;
      if (track.kind === Track.Kind.Video) {
        element.className = 'meeting-video-tile';
        const video = track.attach() as HTMLVideoElement;
        video.autoplay = true;
        video.playsInline = true;
        video.className = 'meeting-video';
        const name = document.createElement('span');
        name.className = 'meeting-video-name';
        name.textContent = participant.name || participant.identity;
        element.append(video, name);
      } else {
        element.className = 'meeting-audio-track';
        const audio = track.attach() as HTMLAudioElement;
        audio.autoplay = true;
        element.append(audio);
      }
      root.append(element);
      attachedTracks.set(key, { track, element });
    };
    const detachTrack = (
      track: RemoteTrack,
      _publication: RemoteTrackPublication,
      participant: RemoteParticipant,
    ) => {
      const key = `${participant.identity}:${track.sid}`;
      const attached = attachedTracks.get(key);
      if (!attached) return;
      track.detach().forEach((element) => element.remove());
      attached.element.remove();
      attachedTracks.delete(key);
    };
    const handleData = (payload: Uint8Array, participant?: RemoteParticipant) => {
      try {
        const data = JSON.parse(new TextDecoder().decode(payload)) as {
          type?: string;
          text?: string;
          handRaised?: boolean;
        };
        if (data.type === 'chat' && typeof data.text === 'string' && participant) {
          const text = data.text;
          setMessages((current) =>
            [
              ...current,
              {
                id: crypto.randomUUID(),
                sender: participant.name || participant.identity,
                text: text.slice(0, 1000),
                sentAt: new Date().toISOString(),
              },
            ].slice(-100),
          );
        }
        if (data.type === 'hand' && participant) {
          setParticipants((current) =>
            current.map((item) =>
              item.id === participant.identity
                ? { ...item, handRaised: Boolean(data.handRaised) }
                : item,
            ),
          );
        }
      } catch {
        // Ignore malformed packets; participant data is untrusted input.
      }
    };

    room.on(RoomEvent.TrackSubscribed, attachTrack);
    room.on(RoomEvent.TrackUnsubscribed, detachTrack);
    room.on(RoomEvent.ParticipantConnected, () => refreshParticipants(room));
    room.on(RoomEvent.ParticipantDisconnected, () => refreshParticipants(room));
    room.on(RoomEvent.DataReceived, handleData);
    room.on(RoomEvent.Disconnected, () => {
      if (active) setConnection('error');
    });

    void room
      .connect(credentials.serverUrl, credentials.token)
      .then(async () => {
        if (!active) return;
        refreshParticipants(room);
        setConnection('connected');
        try {
          await room.localParticipant.setMicrophoneEnabled(initialMicrophoneEnabled);
          if (initialCameraEnabled) await room.localParticipant.setCameraEnabled(true);
        } catch {
          if (active) {
            setMicrophoneEnabled(false);
            setError('Não foi possível ativar o microfone. Verifique a permissão do navegador.');
          }
        }
      })
      .catch((caught: unknown) => {
        if (!active) return;
        setConnection('error');
        setError(caught instanceof Error ? caught.message : 'Não foi possível conectar à reunião.');
      });

    return () => {
      active = false;
      attachedTracks.forEach(({ track, element }) => {
        track.detach().forEach((mediaElement) => mediaElement.remove());
        element.remove();
      });
      attachedTracks.clear();
      room.removeAllListeners();
      void room.disconnect(true);
      roomRef.current = null;
    };
  }, [
    credentials.serverUrl,
    credentials.token,
    initialCameraEnabled,
    initialMicrophoneEnabled,
    refreshParticipants,
  ]);

  const publishControl = async (data: Record<string, unknown>) => {
    const room = roomRef.current;
    if (!room || room.state !== 'connected') return;
    await room.localParticipant.publishData(new TextEncoder().encode(JSON.stringify(data)), {
      reliable: true,
    });
  };

  const toggleMicrophone = async () => {
    const next = !microphoneEnabled;
    try {
      await roomRef.current?.localParticipant.setMicrophoneEnabled(next);
      setMicrophoneEnabled(next);
      setError('');
    } catch {
      setError('Não foi possível alterar o microfone. Verifique a permissão do navegador.');
    }
  };

  const toggleCamera = async () => {
    const next = !cameraEnabled;
    try {
      await roomRef.current?.localParticipant.setCameraEnabled(next);
      setCameraEnabled(next);
      setError('');
    } catch {
      setError('Não foi possível acessar a câmera. Verifique a permissão do navegador.');
    }
  };

  const toggleScreenShare = async () => {
    const next = !screenShareEnabled;
    try {
      await roomRef.current?.localParticipant.setScreenShareEnabled(next);
      setScreenShareEnabled(next);
      setError('');
    } catch {
      setError('O compartilhamento de tela foi cancelado ou não está disponível.');
    }
  };

  const sendChatMessage = async () => {
    const text = chatText.trim();
    if (!text) return;
    try {
      await publishControl({ type: 'chat', text: text.slice(0, 1000) });
      setMessages((current) =>
        [
          ...current,
          {
            id: crypto.randomUUID(),
            sender: 'Você',
            text: text.slice(0, 1000),
            sentAt: new Date().toISOString(),
          },
        ].slice(-100),
      );
      setChatText('');
    } catch {
      setError('Não foi possível enviar a mensagem para a reunião.');
    }
  };

  const toggleHand = async () => {
    const raised = !participants.find((participant) => participant.id === userId)?.handRaised;
    try {
      await publishControl({ type: 'hand', handRaised: raised });
      setParticipants((current) =>
        current.map((participant) =>
          participant.id === userId ? { ...participant, handRaised: raised } : participant,
        ),
      );
    } catch {
      setError('Não foi possível atualizar a mão levantada.');
    }
  };

  return (
    <section className="meeting-room" aria-label={`Reunião: ${credentials.title}`}>
      <header className="meeting-room-header">
        <div>
          <span className="eyebrow">SALA AO VIVO</span>
          <h1>{credentials.title}</h1>
          <p>
            {connection === 'connected'
              ? 'Conectado à reunião'
              : connection === 'connecting'
                ? 'Conectando com segurança…'
                : 'Conexão encerrada'}
          </p>
        </div>
        <div className="meeting-room-status">
          <span className={`meeting-status-dot meeting-status-${connection}`} />
          {participants.length} participante{participants.length === 1 ? '' : 's'}
        </div>
      </header>
      {error && (
        <p className="activity-error" role="alert">
          {error}
        </p>
      )}
      <div className={`meeting-room-content ${chatOpen ? 'meeting-chat-open' : ''}`}>
        <div className="meeting-media-area">
          <div ref={mediaRootRef} className="meeting-media-grid" aria-live="polite" />
          {participants.length === 0 && (
            <div className="meeting-waiting">
              <Users size={28} />
              <h2>
                {connection === 'connecting' ? 'Entrando na reunião…' : 'Aguardando participantes'}
              </h2>
              <p>Compartilhe o link da reunião com sua equipe.</p>
            </div>
          )}
          <div className="meeting-participant-list" aria-label="Participantes da reunião">
            {participants.map((participant) => (
              <span key={participant.id}>
                {participant.name}
                {participant.handRaised && (
                  <span className="meeting-hand-raised" aria-label="mão levantada">
                    {' '}
                    ✋
                  </span>
                )}
              </span>
            ))}
          </div>
          <footer className="meeting-controls">
            <button
              type="button"
              className={`meeting-control ${microphoneEnabled ? '' : 'meeting-control-muted'}`}
              onClick={() => void toggleMicrophone()}
              disabled={connection !== 'connected'}
              aria-label={microphoneEnabled ? 'Desativar microfone' : 'Ativar microfone'}
            >
              {microphoneEnabled ? <Mic size={19} /> : <MicOff size={19} />}
              <span>Microfone</span>
            </button>
            <button
              type="button"
              className={`meeting-control ${cameraEnabled ? '' : 'meeting-control-muted'}`}
              onClick={() => void toggleCamera()}
              disabled={connection !== 'connected'}
              aria-label={cameraEnabled ? 'Desativar câmera' : 'Ativar câmera'}
            >
              {cameraEnabled ? <Video size={19} /> : <CameraOff size={19} />}
              <span>Câmera</span>
            </button>
            <button
              type="button"
              className={`meeting-control ${screenShareEnabled ? 'meeting-control-active' : ''}`}
              onClick={() => void toggleScreenShare()}
              disabled={connection !== 'connected'}
              aria-label={screenShareEnabled ? 'Parar compartilhamento' : 'Compartilhar tela'}
            >
              {screenShareEnabled ? <MonitorUp size={19} /> : <MonitorUp size={19} />}
              <span>Compartilhar</span>
            </button>
            <button
              type="button"
              className="meeting-control"
              onClick={() => setChatOpen((open) => !open)}
              aria-label={chatOpen ? 'Fechar chat da reunião' : 'Abrir chat da reunião'}
            >
              <MessageCircle size={19} />
              <span>Chat</span>
            </button>
            <button
              type="button"
              className="meeting-control"
              onClick={() => void toggleHand()}
              aria-label="Levantar ou abaixar a mão"
            >
              <span className="meeting-hand-icon">✋</span>
              <span>Mão</span>
            </button>
            <button
              type="button"
              className="meeting-hangup"
              onClick={onLeave}
              aria-label="Sair da reunião"
            >
              <PhoneOff size={19} />
              <span>Sair</span>
            </button>
          </footer>
        </div>
        {chatOpen && (
          <aside className="meeting-chat-panel" aria-label="Chat da reunião">
            <header>
              <div>
                <h2>Chat da reunião</h2>
                <p>Mensagens visíveis para participantes conectados.</p>
              </div>
              <button type="button" aria-label="Fechar chat" onClick={() => setChatOpen(false)}>
                <X size={17} />
              </button>
            </header>
            <div className="meeting-chat-messages" aria-live="polite">
              {messages.length ? (
                messages.map((message) => (
                  <article key={message.id}>
                    <strong>{message.sender}</strong>
                    <p>{message.text}</p>
                    <time>{eventTime(message.sentAt)}</time>
                  </article>
                ))
              ) : (
                <p className="meeting-chat-empty">
                  As mensagens enviadas durante a reunião aparecem aqui.
                </p>
              )}
            </div>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                void sendChatMessage();
              }}
            >
              <input
                value={chatText}
                onChange={(event) => setChatText(event.target.value)}
                maxLength={1000}
                placeholder="Escreva uma mensagem"
                aria-label="Mensagem da reunião"
              />
              <button type="submit" disabled={!chatText.trim()} aria-label="Enviar mensagem">
                <Send size={16} />
              </button>
            </form>
          </aside>
        )}
      </div>
    </section>
  );
}

function eventTime(value: string) {
  return new Intl.DateTimeFormat('pt-BR', { hour: '2-digit', minute: '2-digit' }).format(
    new Date(value),
  );
}

export function CallsPage() {
  const { accessToken: token, user } = useAuth();
  const location = useLocation();
  const query = useMemo(() => new URLSearchParams(location.search), [location.search]);
  const requestedWorkspaceId = query.get('workspaceId') ?? '';
  const requestedConversationId = query.get('conversationId') ?? '';
  const eventId = query.get('eventId') ?? '';
  const [workspaces, setWorkspaces] = useState<RemoteWorkspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState(requestedWorkspaceId);
  const [conversations, setConversations] = useState<RemoteConversation[]>([]);
  const [conversationId, setConversationId] = useState(requestedConversationId);
  const [channelId, setChannelId] = useState(query.get('channelId') ?? '');
  const [callTarget, setCallTarget] = useState<'conversation' | 'channel'>(
    query.get('channelId') ? 'channel' : 'conversation',
  );
  const [channels, setChannels] = useState<RemoteChannel[]>([]);
  const [history, setHistory] = useState<RemoteCallHistoryItem[]>([]);
  const [credentials, setCredentials] = useState<RemoteMeetingCredentials | null>(null);
  const [roomOptions, setRoomOptions] = useState<{
    microphoneEnabled: boolean;
    cameraEnabled: boolean;
  } | null>(null);
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const joinedEventRef = useRef('');
  const startedFromChatRef = useRef('');
  const directConversations = useMemo(
    () =>
      conversations.filter(
        (conversation) =>
          conversation.type === 'DIRECT' && conversation.workspaceId === workspaceId,
      ),
    [conversations, workspaceId],
  );

  const startCall = useCallback(
    async (target = callTarget) => {
      if (!token || !workspaceId) return;
      if (target === 'channel' && channelId) {
        setCredentials(await startChannelCall(token, workspaceId, channelId));
      } else if (target === 'conversation' && conversationId) {
        setCredentials(await startDirectCall(token, workspaceId, conversationId));
      }
    },
    [callTarget, channelId, conversationId, token, workspaceId],
  );

  const loadHistory = useCallback(async () => {
    if (!token || !workspaceId) return;
    try {
      const result = await getCallHistory(token, workspaceId);
      setHistory(result.items);
    } catch (caught) {
      setError(
        caught instanceof Error
          ? caught.message
          : 'Não foi possível carregar o histórico de chamadas.',
      );
    }
  }, [token, workspaceId]);

  useEffect(() => {
    if (!token) return;
    let active = true;
    void Promise.all([getWorkspaces(token), getConversations(token)])
      .then(([workspaceList, conversationList]) => {
        if (!active) return;
        setWorkspaces(workspaceList);
        setConversations(conversationList);
        setWorkspaceId(
          (current) =>
            current ||
            workspaceList.find(({ id }) => id === requestedWorkspaceId)?.id ||
            workspaceList[0]?.id ||
            '',
        );
        setConversationId((current) => current || requestedConversationId);
      })
      .catch((caught: unknown) => {
        if (active)
          setError(
            caught instanceof Error ? caught.message : 'Não foi possível carregar suas chamadas.',
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [requestedConversationId, requestedWorkspaceId, token]);

  useEffect(() => {
    if (!token || !workspaceId) {
      setChannels([]);
      return;
    }
    let active = true;
    void getWorkspace(token, workspaceId)
      .then((workspace) => {
        if (active)
          setChannels(
            workspace.teams.flatMap((team) => team.channels.filter((channel) => channel.joined)),
          );
      })
      .catch(() => {
        if (active) setChannels([]);
      });
    return () => {
      active = false;
    };
  }, [token, workspaceId]);

  useEffect(() => {
    void loadHistory();
  }, [loadHistory]);

  useEffect(() => {
    if (!token || !eventId || !workspaceId || credentials || joinedEventRef.current === eventId)
      return;
    joinedEventRef.current = eventId;
    let active = true;
    setBusy(true);
    setError('');
    void joinCalendarMeeting(token, eventId)
      .then((meeting) => {
        if (active) setCredentials(meeting);
      })
      .catch((caught: unknown) => {
        if (active)
          setError(
            caught instanceof Error ? caught.message : 'Não foi possível entrar nesta reunião.',
          );
      })
      .finally(() => {
        if (active) setBusy(false);
      });
    return () => {
      active = false;
    };
  }, [credentials, eventId, token, workspaceId]);

  useEffect(() => {
    if (loading || !token || !workspaceId || eventId || credentials) return;
    const targetId = callTarget === 'channel' ? query.get('channelId') : requestedConversationId;
    if (!targetId) return;
    const key = `${workspaceId}:${callTarget}:${targetId}`;
    const available =
      callTarget === 'channel'
        ? channels.some((channel) => channel.id === targetId)
        : directConversations.some((conversation) => conversation.id === targetId);
    if (!available || startedFromChatRef.current === key) return;
    startedFromChatRef.current = key;
    setBusy(true);
    setError('');
    void (
      callTarget === 'channel'
        ? startChannelCall(token, workspaceId, targetId)
        : startDirectCall(token, workspaceId, targetId)
    )
      .then(setCredentials)
      .catch((caught: unknown) =>
        setError(caught instanceof Error ? caught.message : 'Não foi possível iniciar a chamada.'),
      )
      .finally(() => setBusy(false));
  }, [
    callTarget,
    channels,
    credentials,
    directConversations,
    eventId,
    loading,
    query,
    requestedConversationId,
    token,
    workspaceId,
  ]);

  const requestCall = async () => {
    setBusy(true);
    setError('');
    try {
      await startCall();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível iniciar a chamada.');
    } finally {
      setBusy(false);
    }
  };

  const exitCall = async () => {
    if (!token || !credentials) return;
    setBusy(true);
    try {
      await leaveCall(token, credentials.id);
      if (credentials.canEnd) await endCall(token, credentials.id);
      setCredentials(null);
      setRoomOptions(null);
      await loadHistory();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível sair da chamada.');
      setCredentials(null);
      setRoomOptions(null);
    } finally {
      setBusy(false);
    }
  };

  const joinExistingCall = async (callId: string) => {
    if (!token) return;
    setBusy(true);
    setError('');
    try {
      setCredentials(await joinActiveCall(token, callId));
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível entrar na chamada.');
    } finally {
      setBusy(false);
    }
  };

  if (credentials && roomOptions) {
    return (
      <MeetingRoom
        credentials={credentials}
        userId={user?.id ?? ''}
        initialMicrophoneEnabled={roomOptions.microphoneEnabled}
        initialCameraEnabled={roomOptions.cameraEnabled}
        onLeave={() => void exitCall()}
      />
    );
  }
  if (credentials) {
    return (
      <MeetingLobby
        title={credentials.title}
        onJoin={setRoomOptions}
        onLeave={() => void exitCall()}
      />
    );
  }

  return (
    <section className="activity-page calls-page" aria-labelledby="calls-title">
      <header className="activity-page-header">
        <div>
          <span className="eyebrow">ROCKET · AO VIVO</span>
          <h1 id="calls-title">Chamadas</h1>
          <p>
            Inicie uma conversa por áudio ou vídeo, entre em uma reunião e retome chamadas recentes.
          </p>
        </div>
        {workspaces.length > 1 && (
          <label className="calendar-workspace-picker">
            <span>Espaço</span>
            <select
              value={workspaceId}
              onChange={(event) => setWorkspaceId(event.target.value)}
              aria-label="Selecionar espaço de trabalho"
            >
              {workspaces.map((workspace) => (
                <option key={workspace.id} value={workspace.id}>
                  {workspace.name}
                </option>
              ))}
            </select>
          </label>
        )}
      </header>
      {error && (
        <p className="activity-error" role="alert">
          {error}
        </p>
      )}
      <div className="calls-start-card">
        <div className="calls-start-icon">
          <Video size={24} />
        </div>
        <div>
          <h2>Reunir agora</h2>
          <p>Inicie uma chamada de áudio e vídeo em uma conversa direta ou canal da sua equipe.</p>
        </div>
        <div className="calls-start-actions">
          <label className="calls-conversation-select">
            <span>Tipo de reunião</span>
            <select
              value={callTarget}
              onChange={(event) => setCallTarget(event.target.value as 'conversation' | 'channel')}
              aria-label="Tipo de reunião"
            >
              <option value="conversation">Conversa direta</option>
              <option value="channel">Canal</option>
            </select>
          </label>
          {callTarget === 'conversation' ? (
            <label className="calls-conversation-select">
              <span>Conversa direta</span>
              <select
                value={conversationId}
                onChange={(event) => setConversationId(event.target.value)}
                aria-label="Selecionar conversa direta"
              >
                <option value="">Escolha uma conversa</option>
                {directConversations.map((conversation) => (
                  <option key={conversation.id} value={conversation.id}>
                    {conversation.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="calls-conversation-select">
              <span>Canal</span>
              <select
                value={channelId}
                onChange={(event) => setChannelId(event.target.value)}
                aria-label="Selecionar canal"
              >
                <option value="">Escolha um canal</option>
                {channels.map((channel) => (
                  <option key={channel.id} value={channel.id}>
                    #{channel.name}
                  </option>
                ))}
              </select>
            </label>
          )}
          <button
            className="button button-primary"
            type="button"
            onClick={() => void requestCall()}
            disabled={
              busy ||
              loading ||
              !workspaceId ||
              (callTarget === 'channel' ? !channelId : !conversationId)
            }
          >
            <Phone size={16} />
            {busy ? 'Conectando…' : 'Iniciar chamada'}
          </button>
        </div>
      </div>
      <section className="calls-history" aria-labelledby="calls-history-title">
        <header>
          <div>
            <span className="eyebrow">RECENTES</span>
            <h2 id="calls-history-title">Histórico de chamadas</h2>
          </div>
          <button
            className="button button-secondary"
            type="button"
            onClick={() => void loadHistory()}
          >
            <ChevronDown size={15} />
            Atualizar
          </button>
        </header>
        {loading ? (
          <p className="activity-feedback" role="status">
            Carregando chamadas…
          </p>
        ) : history.length ? (
          <div className="calls-history-list">
            {history.map((call) => (
              <article className="calls-history-item" key={call.id}>
                <span className="calls-history-icon">
                  <Headphones size={17} />
                </span>
                <div>
                  <strong>{call.title}</strong>
                  <p>
                    {dateLabel(call.startedAt)} · {call.participants.length} participante
                    {call.participants.length === 1 ? '' : 's'}
                    {call.channelId
                      ? ' · Canal'
                      : call.conversationId
                        ? ' · Conversa'
                        : ' · Evento'}
                  </p>
                  {call.participants.length > 0 && (
                    <small>
                      {call.participants.map((participant) => participant.displayName).join(', ')}
                    </small>
                  )}
                </div>
                <span className={`calls-ended-state ${call.endedAt ? '' : 'calls-active-state'}`}>
                  {call.endedAt ? 'Encerrada' : 'Ainda ativa'}
                </span>
                {!call.endedAt && (
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => void joinExistingCall(call.id)}
                    disabled={busy}
                  >
                    Entrar
                  </button>
                )}
              </article>
            ))}
          </div>
        ) : (
          <div className="activity-empty">
            <Phone size={25} />
            <h2>Nenhuma chamada recente</h2>
            <p>As chamadas iniciadas por você ou das quais participou aparecem aqui.</p>
          </div>
        )}
      </section>
    </section>
  );
}
