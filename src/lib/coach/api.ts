import { getProgramme, getProfile } from '../programme/store';
import { ProposeEditsInput } from '../programme/ops';
import { Profile } from '../programme/types';
import { coerceHistory, HISTORY_KEY } from '../history';
import { getBests } from '../bests';
import { COACH_URL } from './config';

export const COACH_TOKEN_KEY = 'vb-coach-token-v1';

export class CoachError extends Error {}
export class CoachAuthError extends CoachError {}
/** 4xx (other than 401) — the request itself was rejected, not a reachability problem. */
export class CoachRequestError extends CoachError {}

export function getCoachToken(): string {
  try {
    return window.localStorage.getItem(COACH_TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveCoachToken(token: string) {
  try {
    window.localStorage.setItem(COACH_TOKEN_KEY, token.trim());
  } catch {
    // ignore
  }
}

function readRecentWorkouts() {
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    const history = coerceHistory(raw ? JSON.parse(raw) : []);
    return [...history].sort((a, b) => b.completedAt - a.completedAt).slice(0, 10);
  } catch {
    return [];
  }
}

function currentWeekNumber(): number {
  // Reads HomePage's explicit week override, if any; otherwise falls back to week 1
  // (this does not replicate HomePage's "first incomplete week" inference).
  try {
    const v = JSON.parse(window.localStorage.getItem('vb-current-week-v1') ?? 'null');
    if (typeof v === 'number') return v;
  } catch {
    // fall through
  }
  return 1;
}

async function post(body: unknown): Promise<Response> {
  const res = await fetch(COACH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getCoachToken()}` },
    body: JSON.stringify(body),
  });
  if (res.status === 401) throw new CoachAuthError('Coach access token is missing or wrong.');
  if (res.status >= 400 && res.status < 500) throw new CoachRequestError(`Coach rejected the request (${res.status}).`);
  if (!res.ok) throw new CoachError(`Coach unavailable (${res.status}).`);
  return res;
}

export async function coachChat(
  messages: { role: 'user' | 'assistant'; content: string }[]
): Promise<{ text: string; proposal: ProposeEditsInput | null }> {
  const res = await post({
    action: 'chat',
    context: {
      profile: getProfile(),
      programme: getProgramme(),
      currentWeek: currentWeekNumber(),
      today: new Date().toISOString().slice(0, 10),
      recentWorkouts: readRecentWorkouts(),
      personalBests: getBests(),
    },
    messages,
  });
  return res.json();
}

export async function coachGenerate(profile: Profile, weeksCount: number) {
  const res = await post({ action: 'generate', profile, weeksCount });
  return res.json() as Promise<{ name: string; weeks: unknown[] }>;
}
