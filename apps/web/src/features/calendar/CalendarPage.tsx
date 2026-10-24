import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import {
  CalendarDays,
  ChevronLeft,
  ChevronRight,
  Clock3,
  ExternalLink,
  MapPin,
  Plus,
  Trash2,
  Users,
  Video,
  X,
} from 'lucide-react';
import { useAuth } from '../../auth/AuthContext';
import {
  createCalendarEvent,
  deleteCalendarEvent,
  getCalendarEvents,
  getWorkspaceMembers,
  getWorkspaces,
  respondToCalendarEvent,
  updateCalendarEvent,
  type RemoteCalendarEvent,
  type RemoteWorkspace,
  type RemoteWorkspaceMember,
  type WorkspaceRole,
} from '../../api';

type CalendarView = 'month' | 'week' | 'day';
type CalendarOccurrence = RemoteCalendarEvent & { occurrenceStart: Date; occurrenceEnd: Date };
type EditorState = { event?: RemoteCalendarEvent; startAt?: Date } | null;

function addDays(date: Date, count: number) {
  const next = new Date(date);
  next.setDate(next.getDate() + count);
  return next;
}

function addMinutes(date: Date, count: number) {
  return new Date(date.getTime() + count * 60_000);
}

function startOfWeek(date: Date) {
  const start = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7));
  return start;
}

function dateInputValue(date: Date) {
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
  return local.toISOString().slice(0, 16);
}

function dateOnlyValue(date: Date) {
  return dateInputValue(date).slice(0, 10);
}

function visibleRange(date: Date, view: CalendarView) {
  if (view === 'day') {
    const from = new Date(date.getFullYear(), date.getMonth(), date.getDate());
    return { from, to: addDays(from, 1) };
  }
  if (view === 'week') {
    const from = startOfWeek(date);
    return { from, to: addDays(from, 7) };
  }
  const first = new Date(date.getFullYear(), date.getMonth(), 1);
  const from = addDays(first, -((first.getDay() + 6) % 7));
  return { from, to: addDays(from, 42) };
}

function nextOccurrence(date: Date, recurrence: RemoteCalendarEvent['recurrence']) {
  const next = new Date(date);
  if (recurrence === 'DAILY') next.setDate(next.getDate() + 1);
  if (recurrence === 'WEEKLY') next.setDate(next.getDate() + 7);
  if (recurrence === 'MONTHLY') {
    const day = next.getDate();
    next.setDate(1);
    next.setMonth(next.getMonth() + 1);
    const lastDay = new Date(next.getFullYear(), next.getMonth() + 1, 0).getDate();
    next.setDate(Math.min(day, lastDay));
  }
  return next;
}

function expandOccurrences(events: RemoteCalendarEvent[], from: Date, to: Date) {
  const occurrences: CalendarOccurrence[] = [];
  for (const event of events) {
    const first = new Date(event.startAt);
    const duration = new Date(event.endAt).getTime() - first.getTime();
    if (event.recurrence === 'NONE') {
      if (first < to && new Date(event.endAt) >= from) {
        occurrences.push({
          ...event,
          occurrenceStart: first,
          occurrenceEnd: new Date(event.endAt),
        });
      }
      continue;
    }
    const until = event.recurrenceUntil ? new Date(event.recurrenceUntil) : first;
    let cursor = first;
    let skipped = 0;
    while (cursor < from && cursor <= until && skipped < 400) {
      cursor = nextOccurrence(cursor, event.recurrence);
      skipped += 1;
    }
    while (cursor < to && cursor <= until && occurrences.length < 2_000) {
      occurrences.push({
        ...event,
        occurrenceStart: new Date(cursor),
        occurrenceEnd: new Date(cursor.getTime() + duration),
      });
      cursor = nextOccurrence(cursor, event.recurrence);
    }
  }
  return occurrences.sort(
    (left, right) => left.occurrenceStart.getTime() - right.occurrenceStart.getTime(),
  );
}

function eventDateTime(date: Date, options: Intl.DateTimeFormatOptions = {}) {
  return new Intl.DateTimeFormat('pt-BR', options).format(date);
}

function eventCanManage(event: RemoteCalendarEvent, userId: string, role: WorkspaceRole) {
  return event.createdBy.id === userId || role === 'OWNER' || role === 'ADMIN';
}

export function CalendarPage() {
  const { accessToken: token, user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [workspaces, setWorkspaces] = useState<RemoteWorkspace[]>([]);
  const [workspaceId, setWorkspaceId] = useState('');
  const [members, setMembers] = useState<RemoteWorkspaceMember[]>([]);
  const [events, setEvents] = useState<RemoteCalendarEvent[]>([]);
  const [date, setDate] = useState(() => new Date());
  const [view, setView] = useState<CalendarView>('month');
  const [loading, setLoading] = useState(true);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [editor, setEditor] = useState<EditorState>(null);
  const [selectedEvent, setSelectedEvent] = useState<CalendarOccurrence | null>(null);

  const role = workspaces.find((workspace) => workspace.id === workspaceId)?.role ?? 'GUEST';
  const range = useMemo(() => visibleRange(date, view), [date, view]);
  const occurrences = useMemo(
    () => expandOccurrences(events, range.from, range.to),
    [events, range],
  );
  const days = useMemo(
    () =>
      view === 'month'
        ? Array.from({ length: 42 }, (_, index) => addDays(range.from, index))
        : view === 'week'
          ? Array.from({ length: 7 }, (_, index) => addDays(range.from, index))
          : [range.from],
    [range, view],
  );

  const reloadEvents = useCallback(async () => {
    if (!token || !workspaceId) return;
    setLoading(true);
    setError('');
    try {
      const result = await getCalendarEvents(
        token,
        workspaceId,
        range.from.toISOString(),
        range.to.toISOString(),
      );
      setEvents(result.items);
    } catch (caught) {
      setError(
        caught instanceof Error ? caught.message : 'Não foi possível carregar o calendário.',
      );
    } finally {
      setLoading(false);
    }
  }, [range.from, range.to, token, workspaceId]);

  useEffect(() => {
    if (!token) return;
    let active = true;
    void getWorkspaces(token)
      .then((items) => {
        if (!active) return;
        setWorkspaces(items);
        const requested = new URLSearchParams(location.search).get('workspaceId');
        setWorkspaceId(
          (current) =>
            current || items.find(({ id }) => id === requested)?.id || items[0]?.id || '',
        );
        if (!items.length) setLoading(false);
      })
      .catch((caught: unknown) => {
        if (active)
          setError(
            caught instanceof Error ? caught.message : 'Não foi possível carregar seus espaços.',
          );
      });
    return () => {
      active = false;
    };
  }, [location.search, token]);

  useEffect(() => {
    if (!token || !workspaceId) return;
    let active = true;
    void Promise.all([
      getWorkspaceMembers(token, workspaceId),
      getCalendarEvents(token, workspaceId, range.from.toISOString(), range.to.toISOString()),
    ])
      .then(([workspaceMembers, result]) => {
        if (!active) return;
        setMembers(workspaceMembers);
        setEvents(result.items);
        setError('');
      })
      .catch((caught: unknown) => {
        if (active)
          setError(
            caught instanceof Error ? caught.message : 'Não foi possível carregar o calendário.',
          );
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [range.from, range.to, token, workspaceId]);

  const moveDate = (direction: number) => {
    if (view === 'month')
      setDate((current) => new Date(current.getFullYear(), current.getMonth() + direction, 1));
    else if (view === 'week') setDate((current) => addDays(current, direction * 7));
    else setDate((current) => addDays(current, direction));
  };

  const saveEvent = async (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!token || !workspaceId) return;
    const form = new FormData(event.currentTarget);
    const recurrence = String(
      form.get('recurrence') ?? 'NONE',
    ) as RemoteCalendarEvent['recurrence'];
    const startAt = new Date(String(form.get('startAt')));
    const endAt = new Date(String(form.get('endAt')));
    const recurrenceDate = String(form.get('recurrenceUntil') ?? '');
    setBusy(true);
    setError('');
    try {
      const input = {
        title: String(form.get('title') ?? '').trim(),
        description: String(form.get('description') ?? '').trim() || null,
        startAt: startAt.toISOString(),
        endAt: endAt.toISOString(),
        timeZone: Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo',
        recurrence,
        reminderMinutes: Number(form.get('reminderMinutes') ?? 15),
        attendeeIds: form.getAll('attendeeIds').map(String),
      };
      if (editor?.event) {
        await updateCalendarEvent(token, editor.event.id, {
          ...input,
          recurrenceUntil:
            recurrence === 'NONE' ? null : new Date(`${recurrenceDate}T23:59:00`).toISOString(),
        });
      } else {
        await createCalendarEvent(token, workspaceId, {
          ...input,
          ...(recurrence === 'NONE'
            ? {}
            : { recurrenceUntil: new Date(`${recurrenceDate}T23:59:00`).toISOString() }),
        });
      }
      setEditor(null);
      await reloadEvents();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível salvar o evento.');
    } finally {
      setBusy(false);
    }
  };

  const respond = async (eventId: string, status: 'ACCEPTED' | 'DECLINED') => {
    if (!token) return;
    setBusy(true);
    try {
      await respondToCalendarEvent(token, eventId, status);
      await reloadEvents();
      setSelectedEvent(null);
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível responder ao convite.');
    } finally {
      setBusy(false);
    }
  };

  const removeEvent = async (eventId: string) => {
    if (!token) return;
    setBusy(true);
    try {
      await deleteCalendarEvent(token, eventId);
      setSelectedEvent(null);
      await reloadEvents();
    } catch (caught) {
      setError(caught instanceof Error ? caught.message : 'Não foi possível excluir o evento.');
    } finally {
      setBusy(false);
    }
  };

  const title =
    view === 'day'
      ? eventDateTime(date, { dateStyle: 'full' })
      : view === 'week'
        ? `${eventDateTime(range.from, { day: 'numeric', month: 'short' })} – ${eventDateTime(addDays(range.to, -1), { day: 'numeric', month: 'short', year: 'numeric' })}`
        : eventDateTime(date, { month: 'long', year: 'numeric' });

  return (
    <section className="activity-page calendar-page" aria-labelledby="calendar-title">
      <header className="activity-page-header">
        <div>
          <span className="eyebrow">ROCKET · ORGANIZAÇÃO</span>
          <h1 id="calendar-title">Calendário</h1>
          <p>Planeje eventos, convide sua equipe e entre nas reuniões em um só lugar.</p>
        </div>
        <div className="calendar-header-actions">
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
          <button
            className="button button-primary"
            type="button"
            onClick={() => setEditor({ startAt: new Date() })}
            disabled={!workspaceId || role === 'GUEST'}
          >
            <Plus size={16} aria-hidden="true" /> Novo evento
          </button>
        </div>
      </header>

      <div className="calendar-toolbar">
        <div className="calendar-date-navigation">
          <button
            className="button button-secondary calendar-icon-button"
            type="button"
            aria-label="Período anterior"
            onClick={() => moveDate(-1)}
          >
            <ChevronLeft size={17} />
          </button>
          <button
            className="button button-secondary"
            type="button"
            onClick={() => setDate(new Date())}
          >
            Hoje
          </button>
          <button
            className="button button-secondary calendar-icon-button"
            type="button"
            aria-label="Próximo período"
            onClick={() => moveDate(1)}
          >
            <ChevronRight size={17} />
          </button>
          <h2>{title}</h2>
        </div>
        <div
          className="calendar-view-switch"
          role="tablist"
          aria-label="Visualização do calendário"
        >
          {(['month', 'week', 'day'] as const).map((value) => (
            <button
              key={value}
              type="button"
              role="tab"
              aria-selected={view === value}
              className={view === value ? 'calendar-view-active' : ''}
              onClick={() => setView(value)}
            >
              {{ month: 'Mês', week: 'Semana', day: 'Dia' }[value]}
            </button>
          ))}
        </div>
      </div>

      {error && (
        <p className="activity-error" role="alert">
          {error}
        </p>
      )}
      {!workspaceId && !loading ? (
        <div className="activity-empty">
          <CalendarDays size={26} />
          <h2>Crie ou entre em um espaço</h2>
          <p>Seu calendário aparece aqui quando você faz parte de um espaço de trabalho.</p>
        </div>
      ) : loading ? (
        <p className="activity-feedback" role="status">
          Carregando eventos…
        </p>
      ) : view === 'month' ? (
        <div className="calendar-month-grid" aria-label="Calendário mensal">
          {['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom'].map((day) => (
            <div key={day} className="calendar-weekday">
              {day}
            </div>
          ))}
          {days.map((day) => {
            const dayEvents = occurrences.filter(
              ({ occurrenceStart }) => occurrenceStart.toDateString() === day.toDateString(),
            );
            const inMonth = day.getMonth() === date.getMonth();
            return (
              <div
                key={day.toISOString()}
                className={`calendar-month-day ${inMonth ? '' : 'calendar-day-outside'} ${day.toDateString() === new Date().toDateString() ? 'calendar-day-today' : ''}`}
              >
                <button
                  className="calendar-day-number"
                  type="button"
                  onClick={() => {
                    setDate(day);
                    setView('day');
                  }}
                >
                  {day.getDate()}
                </button>
                <div className="calendar-day-events">
                  {dayEvents.slice(0, 3).map((event) => (
                    <button
                      key={`${event.id}-${event.occurrenceStart.toISOString()}`}
                      className="calendar-event-chip"
                      type="button"
                      onClick={() => setSelectedEvent(event)}
                    >
                      <time>
                        {eventDateTime(event.occurrenceStart, {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}
                      </time>
                      <span>{event.title}</span>
                    </button>
                  ))}
                  {dayEvents.length > 3 && (
                    <span className="calendar-more-events">+{dayEvents.length - 3} eventos</span>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="calendar-agenda" aria-live="polite">
          {days.map((day) => {
            const dayEvents = occurrences.filter(
              ({ occurrenceStart }) => occurrenceStart.toDateString() === day.toDateString(),
            );
            return (
              <section key={day.toISOString()} className="calendar-agenda-day">
                <h3>
                  <span>{eventDateTime(day, { weekday: 'long' })}</span>
                  <time>{eventDateTime(day, { day: 'numeric', month: 'long' })}</time>
                </h3>
                {dayEvents.length ? (
                  dayEvents.map((event) => (
                    <button
                      className="calendar-agenda-event"
                      type="button"
                      key={`${event.id}-${event.occurrenceStart.toISOString()}`}
                      onClick={() => setSelectedEvent(event)}
                    >
                      <time>
                        {eventDateTime(event.occurrenceStart, {
                          hour: '2-digit',
                          minute: '2-digit',
                        })}{' '}
                        –{' '}
                        {eventDateTime(event.occurrenceEnd, { hour: '2-digit', minute: '2-digit' })}
                      </time>
                      <span>
                        <strong>{event.title}</strong>
                        <small>
                          {event.attendees.length} participantes
                          {event.reminderMinutes
                            ? ` · lembrete ${event.reminderMinutes} min antes`
                            : ''}
                        </small>
                      </span>
                      <Video size={17} aria-hidden="true" />
                    </button>
                  ))
                ) : (
                  <p className="calendar-no-events">Nenhum evento neste dia.</p>
                )}
              </section>
            );
          })}
        </div>
      )}

      {editor && (
        <div
          className="calendar-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setEditor(null);
          }}
        >
          <section
            className="calendar-modal"
            role="dialog"
            aria-modal="true"
            aria-labelledby="calendar-editor-title"
          >
            <header>
              <div>
                <span className="eyebrow">EVENTO DO ESPAÇO</span>
                <h2 id="calendar-editor-title">{editor.event ? 'Editar evento' : 'Novo evento'}</h2>
              </div>
              <button
                type="button"
                className="calendar-close-button"
                aria-label="Fechar formulário"
                onClick={() => setEditor(null)}
              >
                <X size={18} />
              </button>
            </header>
            <form onSubmit={(event) => void saveEvent(event)}>
              <label>
                Título
                <input
                  name="title"
                  required
                  minLength={2}
                  maxLength={120}
                  defaultValue={editor.event?.title ?? ''}
                  autoFocus
                />
              </label>
              <label>
                Descrição
                <textarea
                  name="description"
                  rows={3}
                  maxLength={2000}
                  defaultValue={editor.event?.description ?? ''}
                />
              </label>
              <div className="calendar-form-row">
                <label>
                  Começa
                  <input
                    name="startAt"
                    type="datetime-local"
                    required
                    defaultValue={dateInputValue(
                      editor.event
                        ? new Date(editor.event.startAt)
                        : (editor.startAt ?? new Date()),
                    )}
                  />
                </label>
                <label>
                  Termina
                  <input
                    name="endAt"
                    type="datetime-local"
                    required
                    defaultValue={dateInputValue(
                      editor.event
                        ? new Date(editor.event.endAt)
                        : addMinutes(editor.startAt ?? new Date(), 60),
                    )}
                  />
                </label>
              </div>
              <div className="calendar-form-row">
                <label>
                  Repetição
                  <select name="recurrence" defaultValue={editor.event?.recurrence ?? 'NONE'}>
                    <option value="NONE">Não se repete</option>
                    <option value="DAILY">Todos os dias</option>
                    <option value="WEEKLY">Toda semana</option>
                    <option value="MONTHLY">Todo mês</option>
                  </select>
                </label>
                <label>
                  Lembrete
                  <select name="reminderMinutes" defaultValue={editor.event?.reminderMinutes ?? 15}>
                    <option value={0}>Sem lembrete</option>
                    <option value={5}>5 minutos antes</option>
                    <option value={15}>15 minutos antes</option>
                    <option value={30}>30 minutos antes</option>
                    <option value={60}>1 hora antes</option>
                    <option value={1440}>1 dia antes</option>
                  </select>
                </label>
              </div>
              <label>
                Repetir até
                <input
                  name="recurrenceUntil"
                  type="date"
                  defaultValue={
                    editor.event?.recurrenceUntil
                      ? dateOnlyValue(new Date(editor.event.recurrenceUntil))
                      : dateOnlyValue(addDays(editor.startAt ?? new Date(), 30))
                  }
                />
              </label>
              <label>
                Convidar participantes
                <select
                  name="attendeeIds"
                  multiple
                  defaultValue={
                    editor.event?.attendees
                      .filter(({ id }) => id !== editor.event?.createdBy.id)
                      .map(({ id }) => id) ?? []
                  }
                >
                  {members
                    .filter((member) => member.id !== user?.id)
                    .map((member) => (
                      <option key={member.id} value={member.id}>
                        {member.displayName} · @{member.username}
                      </option>
                    ))}
                </select>
                <small>Use Ctrl ou Command para selecionar várias pessoas.</small>
              </label>
              <footer>
                <button
                  type="button"
                  className="button button-secondary"
                  onClick={() => setEditor(null)}
                >
                  Cancelar
                </button>
                <button type="submit" className="button button-primary" disabled={busy}>
                  {busy ? 'Salvando…' : editor.event ? 'Salvar alterações' : 'Criar evento'}
                </button>
              </footer>
            </form>
          </section>
        </div>
      )}

      {selectedEvent && (
        <div
          className="calendar-modal-backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) setSelectedEvent(null);
          }}
        >
          <section
            className="calendar-modal calendar-event-details"
            role="dialog"
            aria-modal="true"
            aria-labelledby="calendar-event-title"
          >
            <header>
              <div>
                <span className="eyebrow">
                  {selectedEvent.recurrence === 'NONE' ? 'EVENTO' : 'EVENTO RECORRENTE'}
                </span>
                <h2 id="calendar-event-title">{selectedEvent.title}</h2>
              </div>
              <button
                type="button"
                className="calendar-close-button"
                aria-label="Fechar detalhes"
                onClick={() => setSelectedEvent(null)}
              >
                <X size={18} />
              </button>
            </header>
            <div className="calendar-event-detail-copy">
              <p>
                <Clock3 size={16} />
                {eventDateTime(selectedEvent.occurrenceStart, {
                  dateStyle: 'full',
                  hour: '2-digit',
                  minute: '2-digit',
                })}{' '}
                –{' '}
                {eventDateTime(selectedEvent.occurrenceEnd, { hour: '2-digit', minute: '2-digit' })}
              </p>
              <p>
                <MapPin size={16} />
                {selectedEvent.timeZone}
              </p>
              <p>
                <Users size={16} />
                Organizado por {selectedEvent.createdBy.displayName} ·{' '}
                {selectedEvent.attendees.length} participantes
              </p>
              {selectedEvent.reminderMinutes > 0 && (
                <p>
                  <Clock3 size={16} />
                  Lembrete configurado para {selectedEvent.reminderMinutes} min antes
                </p>
              )}
              {selectedEvent.description && (
                <p className="calendar-event-description">{selectedEvent.description}</p>
              )}
              <div className="calendar-attendee-list">
                {selectedEvent.attendees.map((attendee) => (
                  <span key={attendee.id}>
                    {attendee.displayName}
                    <small>
                      {attendee.status === 'INVITED'
                        ? 'Convidado'
                        : attendee.status === 'ACCEPTED'
                          ? 'Aceitou'
                          : 'Recusou'}
                    </small>
                  </span>
                ))}
              </div>
            </div>
            <footer className="calendar-event-actions">
              {selectedEvent.attendees.some(
                ({ id, status }) => id === user?.id && status === 'INVITED',
              ) && (
                <>
                  <button
                    type="button"
                    className="button button-secondary"
                    disabled={busy}
                    onClick={() => void respond(selectedEvent.id, 'DECLINED')}
                  >
                    Recusar
                  </button>
                  <button
                    type="button"
                    className="button button-primary"
                    disabled={busy}
                    onClick={() => void respond(selectedEvent.id, 'ACCEPTED')}
                  >
                    Aceitar convite
                  </button>
                </>
              )}
              <button
                type="button"
                className="button button-primary"
                onClick={() =>
                  navigate(
                    `/chamadas?eventId=${encodeURIComponent(selectedEvent.id)}&workspaceId=${encodeURIComponent(workspaceId)}`,
                  )
                }
              >
                <Video size={16} />
                Entrar na reunião
              </button>
              {eventCanManage(selectedEvent, user?.id ?? '', role) && (
                <>
                  <button
                    type="button"
                    className="button button-secondary"
                    onClick={() => {
                      setEditor({ event: selectedEvent });
                      setSelectedEvent(null);
                    }}
                  >
                    <ExternalLink size={15} />
                    Editar
                  </button>
                  <button
                    type="button"
                    className="button button-danger"
                    disabled={busy}
                    onClick={() => void removeEvent(selectedEvent.id)}
                  >
                    <Trash2 size={15} />
                    Excluir
                  </button>
                </>
              )}
            </footer>
          </section>
        </div>
      )}
    </section>
  );
}
