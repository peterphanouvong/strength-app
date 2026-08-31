import { useEffect, useState } from 'react';

export type ActiveSession = { dayId: string; startedAt: number };

const KEY = 'vb-active-session-v1';

export function getActiveSession(): ActiveSession | null {
  try {
    const raw = window.localStorage.getItem(KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as ActiveSession;
    if (!parsed?.dayId || !parsed?.startedAt) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function startSession(dayId: string): ActiveSession {
  const session = { dayId, startedAt: Date.now() };
  window.localStorage.setItem(KEY, JSON.stringify(session));
  return session;
}

export function endSession() {
  window.localStorage.removeItem(KEY);
}

/** Polls the active session once a second — usable from any page. */
export function useActiveSession(): { session: ActiveSession | null; elapsed: number } {
  const [session, setSession] = useState<ActiveSession | null>(() => getActiveSession());
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    const tick = () => {
      const s = getActiveSession();
      setSession((prev) =>
        prev?.dayId === s?.dayId && prev?.startedAt === s?.startedAt ? prev : s
      );
      setElapsed(s ? Math.floor((Date.now() - s.startedAt) / 1000) : 0);
    };
    tick();
    const interval = window.setInterval(tick, 1000);
    return () => window.clearInterval(interval);
  }, []);

  return { session, elapsed };
}
