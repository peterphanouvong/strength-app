// Personal bests — the additive vb-personal-bests-v1 store plus the "is this set
// a new best?" checks (docs/superpowers/specs/2026-09-05-consumer-flows-design.md).
//
// Weighted exercises track the heaviest set (reps break ties at equal weight);
// reps-tracked exercises track the highest rep count. Time-tracked exercises are
// deliberately excluded — data.ts has no lower-is-better flag, and sprints must
// never celebrate slower times.

import { TRAINING_PLAN, Exercise, WorkoutDay } from '../data';
import { PROGRESS_KEY, ProgressMap, SetLog } from './progress';

export const BESTS_KEY = 'vb-personal-bests-v1';

export type PersonalBest = {
  bestWeight?: { weight: number; reps: number; dayId: string; at: number };
  bestReps?: { reps: number; dayId: string; at: number };
};

export type BestsMap = Record<string, PersonalBest>;

/**
 * Guard for values read from storage. Returns null (→ re-seed) when the value
 * isn't an object at all; otherwise keeps only well-shaped records, normalising
 * the provenance fields so sorting by `at` can never hit NaN.
 */
function coerceBests(value: unknown): BestsMap | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const out: BestsMap = {};
  for (const [name, pb] of Object.entries(value as Record<string, unknown>)) {
    if (!pb || typeof pb !== 'object') continue;
    const { bestWeight, bestReps } = pb as PersonalBest;
    const entry: PersonalBest = {};
    if (bestWeight && typeof bestWeight.weight === 'number' && typeof bestWeight.reps === 'number') {
      entry.bestWeight = {
        weight: bestWeight.weight,
        reps: bestWeight.reps,
        dayId: typeof bestWeight.dayId === 'string' ? bestWeight.dayId : '',
        at: typeof bestWeight.at === 'number' ? bestWeight.at : 0,
      };
    }
    if (bestReps && typeof bestReps.reps === 'number') {
      entry.bestReps = {
        reps: bestReps.reps,
        dayId: typeof bestReps.dayId === 'string' ? bestReps.dayId : '',
        at: typeof bestReps.at === 'number' ? bestReps.at : 0,
      };
    }
    if (entry.bestWeight || entry.bestReps) out[name] = entry;
  }
  return out;
}

export function saveBests(bests: BestsMap) {
  try {
    window.localStorage.setItem(BESTS_KEY, JSON.stringify(bests));
  } catch {
    // storage full/blocked — bests are derivable, never worth crashing over
  }
}

/**
 * Read the bests map. On first read (key absent or unreadable) it bootstraps
 * lazily from the existing progress map, so long-time data counts from day one.
 */
export function getBests(): BestsMap {
  try {
    const raw = window.localStorage.getItem(BESTS_KEY);
    if (raw !== null) {
      const coerced = coerceBests(JSON.parse(raw));
      if (coerced) return coerced;
    }
  } catch {
    // corrupt/unreadable — fall through and re-seed from progress
  }
  const seeded = bootstrapFromProgress();
  saveBests(seeded);
  return seeded;
}

/**
 * Fold one completed set log into the map. Returns the SAME object when nothing
 * improved, so callers can identity-check for "new best". Time-tracked exercises
 * never fold. Weighted reps fall back to the prescription's leading number (the
 * same convention as getDayVolume) — reps only matter for ties and display.
 */
export function foldSetLog(
  bests: BestsMap,
  exercise: Exercise,
  log: SetLog,
  dayId: string,
  at: number
): BestsMap {
  if (!log.completed || exercise.tracking === 'time') return bests;
  const current = bests[exercise.name];

  if (exercise.tracking === 'weighted') {
    const weight = parseFloat(log.weight || '');
    if (!(weight > 0)) return bests;
    const reps = parseInt(log.actualReps || '', 10) || parseInt(exercise.reps, 10) || 0;
    const best = current?.bestWeight;
    if (best && !(weight > best.weight || (weight === best.weight && reps > best.reps))) return bests;
    return { ...bests, [exercise.name]: { ...current, bestWeight: { weight, reps, dayId, at } } };
  }

  // reps-tracked: an explicit rep count is required — the prescription is a
  // target, not a performance, so it can never mint a best by itself.
  const reps = parseInt(log.actualReps || '', 10);
  if (!(reps > 0)) return bests;
  const best = current?.bestReps;
  if (best && reps <= best.reps) return bests;
  return { ...bests, [exercise.name]: { ...current, bestReps: { reps, dayId, at } } };
}

/**
 * Live check at set completion: stores the improvement immediately and reports
 * whether this set is a new best. Un-ticking never calls this — stored bests are
 * not revoked (history reconciles at Save).
 */
export function recordSetBest(exercise: Exercise, log: SetLog, dayId: string, at = Date.now()): boolean {
  const bests = getBests();
  const next = foldSetLog(bests, exercise, log, dayId, at);
  if (next === bests) return false;
  saveBests(next);
  return true;
}

/** Save-time reconcile: fold every logged set of the day (the source of truth). */
export function reconcileDayBests(day: WorkoutDay, progress: ProgressMap, at = Date.now()): BestsMap {
  let bests = getBests();
  for (const exercise of day.exercises) {
    for (let i = 0; i < exercise.sets; i++) {
      const log = progress[`${exercise.id}-${i}`];
      if (log) bests = foldSetLog(bests, exercise, log, day.id, at);
    }
  }
  saveBests(bests);
  return bests;
}

/** Derive bests from the whole progress map (first-run seed of the new key). */
function bootstrapFromProgress(): BestsMap {
  let progress: ProgressMap = {};
  try {
    const raw = window.localStorage.getItem(PROGRESS_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) progress = parsed as ProgressMap;
  } catch {
    progress = {};
  }
  let bests: BestsMap = {};
  const at = Date.now();
  for (const week of TRAINING_PLAN) {
    for (const day of week.days) {
      for (const exercise of day.exercises) {
        for (let i = 0; i < exercise.sets; i++) {
          const log = progress[`${exercise.id}-${i}`];
          if (log) bests = foldSetLog(bests, exercise, log, day.id, at);
        }
      }
    }
  }
  return bests;
}

// ---------- display derivation ----------

export type PrEntry = { exercise: string; label: string; at: number };

/** Flatten the map for lists: one "Back Squat · 90 kg × 6" row per record, newest first. */
export function listPrs(bests: BestsMap): PrEntry[] {
  const out: PrEntry[] = [];
  for (const [exercise, pb] of Object.entries(bests)) {
    if (pb.bestWeight) {
      out.push({
        exercise,
        label: `${pb.bestWeight.weight} kg × ${pb.bestWeight.reps}`,
        at: pb.bestWeight.at,
      });
    }
    if (pb.bestReps) {
      out.push({ exercise, label: `${pb.bestReps.reps} reps`, at: pb.bestReps.at });
    }
  }
  return out.sort((a, b) => b.at - a.at);
}
