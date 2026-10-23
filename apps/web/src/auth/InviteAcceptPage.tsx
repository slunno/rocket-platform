import { useEffect, useRef, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { acceptWorkspaceInvite, getWorkspace } from '../api';
import { useAuth } from './AuthContext';

export function InviteAcceptPage() {
  const { accessToken } = useAuth();
  const navigate = useNavigate();
  const [searchParams] = useSearchParams();
  const [error, setError] = useState('');
  const started = useRef(false);
  const mounted = useRef(false);

  useEffect(() => {
    if (!accessToken) return;
    mounted.current = true;
    if (started.current)
      return () => {
        mounted.current = false;
      };
    const inviteToken = searchParams.get('token');
    if (!inviteToken) {
      setError('O link não contém um convite válido.');
      return;
    }
    started.current = true;
    void acceptWorkspaceInvite(accessToken, inviteToken)
      .then(async (acceptedWorkspace) => {
        const detail = await getWorkspace(accessToken, acceptedWorkspace.id);
        if (!mounted.current) return;
        const targetTeam =
          detail.teams.find((team) => team.id === acceptedWorkspace.teamId) ?? detail.teams[0];
        const targetChannel =
          targetTeam?.channels.find(
            (channel) => channel.joined && channel.visibility === 'PUBLIC',
          ) ?? targetTeam?.channels.find((channel) => channel.joined);
        navigate(
          targetTeam && targetChannel
            ? `/equipes/${encodeURIComponent(targetTeam.id)}/${encodeURIComponent(targetChannel.id)}`
            : '/chat/produto',
          { replace: true, state: { workspaceId: acceptedWorkspace.id } },
        );
      })
      .catch((caught: unknown) => {
        if (mounted.current)
          setError(
            caught instanceof Error ? caught.message : 'Não foi possível aceitar o convite.',
          );
      });
    return () => {
      mounted.current = false;
    };
  }, [accessToken, navigate, searchParams]);

  return (
    <main className="auth-page">
      <section className="auth-card" aria-labelledby="invite-title">
        <span className="brand-mark-small" aria-hidden="true">
          r
        </span>
        <h1 id="invite-title">Aceitar convite</h1>
        {error ? (
          <p className="auth-feedback auth-error" role="alert">
            {error}
          </p>
        ) : (
          <p className="auth-feedback" role="status" aria-live="polite">
            Validando seu convite…
          </p>
        )}
        {error && (
          <button
            className="button button-primary auth-submit"
            onClick={() => navigate('/chat/produto', { replace: true })}
          >
            Ir para o Rocket
          </button>
        )}
      </section>
    </main>
  );
}
