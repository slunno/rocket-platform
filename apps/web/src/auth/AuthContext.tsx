import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from 'react';
import {
  ApiRequestError,
  login as loginRequest,
  logout as logoutRequest,
  logoutAll as logoutAllRequest,
  refreshSession,
  register as registerRequest,
  startDemoSession,
  updateProfile as updateProfileRequest,
  type AuthSession,
  type AuthUser,
} from '../api';

type AuthState = 'loading' | 'authenticated' | 'anonymous';
type ProfileUpdate = Parameters<typeof updateProfileRequest>[1];

type AuthContextValue = {
  state: AuthState;
  user: AuthUser | null;
  accessToken: string | null;
  login: (email: string, password: string) => Promise<void>;
  register: (displayName: string, email: string, password: string) => Promise<void>;
  demoLogin: () => Promise<void>;
  refresh: () => Promise<string | null>;
  logout: () => Promise<void>;
  logoutAll: () => Promise<void>;
  updateProfile: (updates: ProfileUpdate) => Promise<AuthUser>;
};

const AuthContext = createContext<AuthContextValue | null>(null);

export function AuthProvider({
  children,
  initialSession,
}: {
  children: ReactNode;
  initialSession?: AuthSession;
}) {
  const [state, setState] = useState<AuthState>(initialSession ? 'authenticated' : 'loading');
  const [user, setUser] = useState<AuthUser | null>(initialSession?.user ?? null);
  const [accessToken, setAccessToken] = useState<string | null>(
    initialSession?.accessToken ?? null,
  );
  const [expiresIn, setExpiresIn] = useState(initialSession?.expiresIn ?? 0);

  const acceptSession = useCallback((session: AuthSession) => {
    setUser(session.user);
    setAccessToken(session.accessToken);
    setExpiresIn(session.expiresIn);
    setState('authenticated');
  }, []);

  const clearSession = useCallback(() => {
    setUser(null);
    setAccessToken(null);
    setExpiresIn(0);
    setState('anonymous');
  }, []);

  const refresh = useCallback(async () => {
    try {
      const session = await refreshSession();
      acceptSession(session);
      return session.accessToken;
    } catch {
      clearSession();
      return null;
    }
  }, [acceptSession, clearSession]);

  useEffect(() => {
    if (initialSession) return;
    void refresh();
  }, [initialSession, refresh]);

  useEffect(() => {
    if (state !== 'authenticated' || !accessToken) return;
    const refreshDelay = Math.max(30_000, (expiresIn - 60) * 1000);
    const timer = window.setTimeout(() => void refresh(), refreshDelay);
    return () => window.clearTimeout(timer);
  }, [accessToken, expiresIn, refresh, state]);

  const login = useCallback(
    async (email: string, password: string) => acceptSession(await loginRequest(email, password)),
    [acceptSession],
  );

  const register = useCallback(
    async (displayName: string, email: string, password: string) =>
      acceptSession(await registerRequest(displayName, email, password)),
    [acceptSession],
  );

  const demoLogin = useCallback(
    async () => acceptSession(await startDemoSession()),
    [acceptSession],
  );

  const logout = useCallback(async () => {
    try {
      await logoutRequest();
    } finally {
      clearSession();
    }
  }, [clearSession]);

  const logoutAll = useCallback(async () => {
    try {
      if (accessToken) {
        try {
          await logoutAllRequest(accessToken);
        } catch (error) {
          if (!(error instanceof ApiRequestError) || error.status !== 401) throw error;
          const refreshedToken = await refresh();
          if (refreshedToken) await logoutAllRequest(refreshedToken);
        }
      }
    } finally {
      clearSession();
    }
  }, [accessToken, clearSession, refresh]);

  const updateProfile = useCallback(
    async (updates: ProfileUpdate) => {
      if (!accessToken) throw new Error('Sessão expirada. Entre novamente.');
      const updatedUser = await updateProfileRequest(accessToken, updates);
      setUser(updatedUser);
      return updatedUser;
    },
    [accessToken],
  );

  const value = useMemo<AuthContextValue>(
    () => ({
      state,
      user,
      accessToken,
      login,
      register,
      demoLogin,
      refresh,
      logout,
      logoutAll,
      updateProfile,
    }),
    [
      state,
      user,
      accessToken,
      login,
      register,
      demoLogin,
      refresh,
      logout,
      logoutAll,
      updateProfile,
    ],
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth() {
  const context = useContext(AuthContext);
  if (!context) throw new Error('useAuth deve ser usado dentro de AuthProvider.');
  return context;
}
