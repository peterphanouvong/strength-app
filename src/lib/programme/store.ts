// User-owned programme state. The programme lives at vb-programme-v1 and is the
// display source of truth for every page; src/data.ts remains the frozen seed.
// Mutations ONLY flow through applyEdits (engine + undo + persist + notify).

import { useSyncExternalStore } from 'react';
import { WeekPlan, TRAINING_PLAN } from '../../data';
import { ProgressMap, PROGRESS_KEY } from '../progress';
import { Programme, Profile } from './types';
import { EditOp } from './ops';
import { applyOps, ApplyResult } from './engine';
import { describeOps } from './describe';

export const PROGRAMME_KEY = 'vb-programme-v1';
export const UNDO_KEY = 'vb-programme-undo-v1';
export const PROFILE_KEY = 'vb-profile-v1';
const UNDO_CAP = 20;

type UndoEntry = { revision: number; at: number; label: string; programme: Programme };

let cache: Programme | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

function coerceProgramme(value: unknown): Programme | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const p = value as Programme;
  if (typeof p.id !== 'string' || typeof p.revision !== 'number' || !Array.isArray(p.weeks)) return null;
  if (!p.weeks.every((w) => w && typeof w.id === 'string' && Array.isArray(w.days))) return null;
  return p;
}

function seedProgramme(): Programme {
  return {
    id: 'prog-seed',
    name: 'Volleyball Strength',
    source: 'seed',
    createdAt: Date.now(),
    revision: 0,
    weeks: JSON.parse(JSON.stringify(TRAINING_PLAN)) as WeekPlan[],
  };
}

function persist(p: Programme) {
  try {
    window.localStorage.setItem(PROGRAMME_KEY, JSON.stringify(p));
  } catch {
    // storage full/blocked — keep the in-memory copy working
  }
}

export function getProgramme(): Programme {
  if (cache) return cache;
  try {
    const raw = window.localStorage.getItem(PROGRAMME_KEY);
    if (raw !== null) {
      const coerced = coerceProgramme(JSON.parse(raw));
      if (coerced) {
        cache = coerced;
        return cache;
      }
    }
  } catch {
    // corrupt — fall through to re-seed
  }
  cache = seedProgramme();
  persist(cache);
  return cache;
}

export const getWeeks = (): WeekPlan[] => getProgramme().weeks;

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useProgramme(): Programme {
  return useSyncExternalStore(subscribe, getProgramme);
}

export const useWeeks = (): WeekPlan[] => useProgramme().weeks;

function readProgress(): ProgressMap {
  try {
    const raw = window.localStorage.getItem(PROGRESS_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as ProgressMap;
  } catch {
    // unreadable progress just means no logged-set warnings
  }
  return {};
}

function readUndo(): UndoEntry[] {
  try {
    const raw = window.localStorage.getItem(UNDO_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (Array.isArray(parsed)) return parsed as UndoEntry[];
  } catch {
    // corrupt undo stack is disposable
  }
  return [];
}

function writeUndo(entries: UndoEntry[]) {
  try {
    window.localStorage.setItem(UNDO_KEY, JSON.stringify(entries.slice(-UNDO_CAP)));
  } catch {
    // undo is a convenience, never worth crashing over
  }
}

export function applyEdits(ops: EditOp[]): ApplyResult {
  const current = getProgramme();
  const result = applyOps(current, ops, readProgress());
  if (!result.ok) return result;
  const label = describeOps(ops, current)[0] ?? 'Edit';
  writeUndo([...readUndo(), { revision: current.revision, at: Date.now(), label, programme: current }]);
  cache = result.programme;
  persist(cache);
  notify();
  return result;
}

export function getUndoCount(): number {
  return readUndo().length;
}

export function undoLast(): boolean {
  const entries = readUndo();
  const last = entries.pop();
  if (!last) return false;
  writeUndo(entries);
  cache = last.programme;
  persist(cache);
  notify();
  return true;
}

/** Install a whole new programme (AI generation / future templates). */
export function installProgramme(p: Programme) {
  cache = p;
  persist(cache);
  writeUndo([]);
  notify();
}

export function getProfile(): Profile | null {
  try {
    const raw = window.localStorage.getItem(PROFILE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (parsed && typeof parsed === 'object' && typeof (parsed as Profile).goals === 'string') {
      return parsed as Profile;
    }
  } catch {
    // corrupt profile — treat as absent
  }
  return null;
}

export function saveProfile(p: Profile) {
  try {
    window.localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
  } catch {
    // ignore
  }
}

// Cross-tab: another tab wrote the programme — drop the cache and re-read.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === null || e.key === PROGRAMME_KEY) {
      cache = null;
      notify();
    }
  });
}
