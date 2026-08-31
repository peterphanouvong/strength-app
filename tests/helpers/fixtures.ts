import type { Page } from '@playwright/test';

// Storage contract — frozen, see docs/gauntlet/ANSWER_KEY.md "Ground truth".
export const PROGRESS_KEY = 'volleyball-workout-progress-v3';
export const SESSION_KEY = 'vb-active-session-v1';
export const REST_KEY = 'vb-rest-overrides-v1';

export type SetLog = {
  completed: boolean;
  weight?: string;
  actualReps?: string;
  timeSec?: string;
  setType?: 'W' | 'F' | 'D';
};

/** Seed localStorage before the app boots. Call before page.goto(). */
export async function seedStorage(
  page: Page,
  data: { progress?: Record<string, SetLog>; session?: { dayId: string; startedAt: number } | null; rest?: Record<string, number> }
) {
  await page.addInitScript(
    ({ progress, session, rest, keys }) => {
      if (progress) window.localStorage.setItem(keys.p, JSON.stringify(progress));
      if (session) window.localStorage.setItem(keys.s, JSON.stringify(session));
      if (rest) window.localStorage.setItem(keys.r, JSON.stringify(rest));
    },
    { progress: data.progress, session: data.session, rest: data.rest, keys: { p: PROGRESS_KEY, s: SESSION_KEY, r: REST_KEY } }
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
