import type { Page } from '@playwright/test';

// Storage contract — frozen, see docs/gauntlet/ANSWER_KEY.md "Ground truth".
export const PROGRESS_KEY = 'volleyball-workout-progress-v3';
export const SESSION_KEY = 'vb-active-session-v1';
export const REST_KEY = 'vb-rest-overrides-v1';
// Additive key (2026-09-05 consumer-flows spec) — saved workout history.
export const HISTORY_KEY = 'vb-workout-history-v1';

export type SetLog = {
  completed: boolean;
  weight?: string;
  actualReps?: string;
  timeSec?: string;
  setType?: 'W' | 'F' | 'D';
};

export type CompletedWorkout = {
  id: string;
  dayId: string;
  weekNum: number;
  dayTitle: string;
  completedAt: number;
  elapsed: number;
  volume: number;
  setsDone: number;
  totalSets: number;
  note?: string;
  title?: string;
};

/** Seed localStorage before the app boots. Call before page.goto(). */
export async function seedStorage(
  page: Page,
  data: {
    progress?: Record<string, SetLog>;
    session?: { dayId: string; startedAt: number } | null;
    rest?: Record<string, number>;
    history?: CompletedWorkout[];
  }
) {
  await page.addInitScript(
    ({ progress, session, rest, history, keys }) => {
      if (progress) window.localStorage.setItem(keys.p, JSON.stringify(progress));
      if (session) window.localStorage.setItem(keys.s, JSON.stringify(session));
      if (rest) window.localStorage.setItem(keys.r, JSON.stringify(rest));
      if (history) window.localStorage.setItem(keys.h, JSON.stringify(history));
    },
    {
      progress: data.progress,
      session: data.session,
      rest: data.rest,
      history: data.history,
      keys: { p: PROGRESS_KEY, s: SESSION_KEY, r: REST_KEY, h: HISTORY_KEY },
    }
  );
}

/**
 * Like seedStorage, but each key is only written when it is absent — so after a
 * page.reload() the values the app wrote during the first visit are preserved
 * (seedStorage's init script would clobber them on every navigation).
 */
export async function seedStorageOnce(
  page: Page,
  data: { progress?: Record<string, SetLog>; session?: { dayId: string; startedAt: number } | null; rest?: Record<string, number> }
) {
  await page.addInitScript(
    ({ progress, session, rest, keys }) => {
      if (progress && !window.localStorage.getItem(keys.p)) window.localStorage.setItem(keys.p, JSON.stringify(progress));
      if (session && !window.localStorage.getItem(keys.s)) window.localStorage.setItem(keys.s, JSON.stringify(session));
      if (rest && !window.localStorage.getItem(keys.r)) window.localStorage.setItem(keys.r, JSON.stringify(rest));
    },
    { progress: data.progress, session: data.session, rest: data.rest, keys: { p: PROGRESS_KEY, s: SESSION_KEY, r: REST_KEY } }
  );
}

/** Seed raw strings (e.g. corrupt JSON) into localStorage before the app boots. */
export async function seedRawStorage(page: Page, entries: Record<string, string>) {
  await page.addInitScript((e) => {
    for (const [k, v] of Object.entries(e)) window.localStorage.setItem(k, v);
  }, entries);
}

export async function readStorage<T>(page: Page, key: string): Promise<T | null> {
  const raw = await page.evaluate((k) => window.localStorage.getItem(k), key);
  return raw ? (JSON.parse(raw) as T) : null;
}

/** Canonical fixture from the answer key: w1-d1 fully logged. Volume = 3,300 kg, 15/15 sets. */
export function canonicalW1D1(): Record<string, SetLog> {
  const progress: Record<string, SetLog> = {};
  // Hang Power Clean w1-d1-e1: 5 sets @ 60 kg × 3
  for (let i = 0; i < 5; i++) progress[`w1-d1-e1-${i}`] = { completed: true, weight: '60', actualReps: '3' };
  // Back Squat w1-d1-e2: 4 sets @ 80 kg × 6
  for (let i = 0; i < 4; i++) progress[`w1-d1-e2-${i}`] = { completed: true, weight: '80', actualReps: '6' };
  // Bulgarian Split Squat w1-d1-e3: 3 sets @ 20 kg × 8
  for (let i = 0; i < 3; i++) progress[`w1-d1-e3-${i}`] = { completed: true, weight: '20', actualReps: '8' };
  // Hanging Knee Raise w1-d1-e4 (reps tracking): 3 sets × 10
  for (let i = 0; i < 3; i++) progress[`w1-d1-e4-${i}`] = { completed: true, actualReps: '10' };
  return progress;
}

/** 3 weeks of Back Squat history (w1..w3 day 1 exercise 2), distinct top weights 80/85/90. */
export function squatHistory3Weeks(): Record<string, SetLog> {
  const progress: Record<string, SetLog> = {};
  const weights = { 1: '80', 2: '85', 3: '90' } as const;
  for (const w of [1, 2, 3] as const) {
    const sets = w === 3 ? 5 : 4; // per MAIN_LIFT: w1/w2 = 4 sets, w3 = 5 sets
    for (let i = 0; i < sets; i++) {
      progress[`w${w}-d1-e2-${i}`] = { completed: true, weight: weights[w], actualReps: '6' };
    }
  }
  return progress;
}

/** Partially-logged w1-d1 for session screenshots: first 2 HPC sets + 1 squat set done. */
export function partialW1D1(): Record<string, SetLog> {
  return {
    'w1-d1-e1-0': { completed: true, weight: '60', actualReps: '3' },
    'w1-d1-e1-1': { completed: true, weight: '60', actualReps: '3', setType: 'W' },
    'w1-d1-e2-0': { completed: true, weight: '80', actualReps: '6' },
    'w1-d1-e2-1': { completed: false, weight: '80' },
  };
}

// ---------- vb-workout-history-v1 seed helpers (phase B) ----------

/** Monday 00:00 local of the week containing `t` — mirrors src/lib/history.ts. */
export function startOfWeekMs(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

/**
 * A timestamp safely inside the Mon-start calendar week `weeksAgo` weeks back
 * (0 = current week). Past weeks land on Wednesday 10:00; the current week uses
 * "a minute ago" clamped to this week's Monday so it can never leak backward.
 */
export function timestampWeeksAgo(weeksAgo: number): number {
  const monday = new Date(startOfWeekMs(Date.now()));
  monday.setDate(monday.getDate() - weeksAgo * 7);
  if (weeksAgo === 0) return Math.max(monday.getTime(), Date.now() - 60_000);
  monday.setDate(monday.getDate() + 2);
  monday.setHours(10, 0, 0, 0);
  return monday.getTime();
}

/** One saved w1-d1 workout `weeksAgo` calendar weeks back (canonical stats). */
export function completedWorkout(weeksAgo: number, overrides: Partial<CompletedWorkout> = {}): CompletedWorkout {
  const completedAt = overrides.completedAt ?? timestampWeeksAgo(weeksAgo);
  return {
    id: `w1-d1-${completedAt}`,
    dayId: 'w1-d1',
    weekNum: 1,
    dayTitle: 'Day A: Lower Strength',
    completedAt,
    elapsed: 47 * 60,
    volume: 3300,
    setsDone: 15,
    totalSets: 15,
    ...overrides,
  };
}

/** History with one saved workout in each listed week (0 = current week, 1 = last week …). */
export function historyForWeeks(weeksAgo: number[]): CompletedWorkout[] {
  return weeksAgo.map((w) => completedWorkout(w));
}
