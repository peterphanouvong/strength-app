// The single mutation path for programmes. Pure and immutable: applyOps never
// touches storage and never mutates its input — the store (store.ts) owns
// persistence, undo, and notification. Batches are atomic: the first invalid
// op fails the whole batch.

import { Exercise, WorkoutDay, WeekPlan } from '../../data';
import { ProgressMap } from '../progress';
import { Programme } from './types';
import { EditOp } from './ops';
import type { z } from 'zod';
import { DayPayloadSchema, ExercisePayloadSchema, WeekPayloadSchema } from './ops';

export type Warning = {
  code: 'rename-detaches-history' | 'logged-sets-affected' | 'remove-week';
  message: string;
};
export type OpError = { opIndex: number; message: string };
export type ApplyResult =
  | { ok: true; programme: Programme; warnings: Warning[] }
  | { ok: false; errors: OpError[] };

type ExercisePayload = z.infer<typeof ExercisePayloadSchema>;
type DayPayload = z.infer<typeof DayPayloadSchema>;
type WeekPayload = z.infer<typeof WeekPayloadSchema>;

const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

function genId(prefix: 'ex' | 'day' | 'wk', taken: Set<string>): string {
  for (;;) {
    let suffix = '';
    for (let i = 0; i < 8; i++) suffix += ID_ALPHABET[Math.floor(Math.random() * ID_ALPHABET.length)];
    const id = `${prefix}-${suffix}`;
    if (!taken.has(id)) {
      taken.add(id);
      return id;
    }
  }
}

function allIds(weeks: WeekPlan[]): Set<string> {
  const ids = new Set<string>();
  for (const w of weeks) {
    ids.add(w.id);
    for (const d of w.days) {
      ids.add(d.id);
      for (const e of d.exercises) ids.add(e.id);
    }
  }
  return ids;
}

/** Any completed/logged entry for this exercise id in the progress map? */
function hasLogs(progress: ProgressMap, exerciseId: string): boolean {
  return Object.keys(progress).some((k) => k.startsWith(`${exerciseId}-`));
}

function dayHasLogs(progress: ProgressMap, day: WorkoutDay): boolean {
  return day.exercises.some((e) => hasLogs(progress, e.id));
}

/**
 * A replace-day/replace-week payload can carry forward an existing exercise's
 * id while changing its name — a rename in effect, same as update-exercise's
 * `patch.name`. Surface the same warning so history/PR detachment is never
 * silent just because the rename arrived via a replace instead of a patch.
 */
function warnRenamedExercises(oldExercises: Exercise[], payloadExercises: ExercisePayload[], warnings: Warning[]): void {
  const byId = new Map(oldExercises.map((e) => [e.id, e]));
  for (const pe of payloadExercises) {
    if (!pe.id) continue;
    const old = byId.get(pe.id);
    if (old && pe.name !== old.name) {
      warnings.push({ code: 'rename-detaches-history', message: `Renaming "${old.name}" to "${pe.name}" — past history and PRs stay under the old name.` });
    }
  }
}

/** Recompute display ordering after structural changes. Ids never change. */
function renumber(weeks: WeekPlan[]): WeekPlan[] {
  return weeks.map((w, wi) => ({
    ...w,
    weekNumber: wi + 1,
    days: w.days.map((d, di) => ({ ...d, day: di + 1 })),
  }));
}

function materialiseExercise(p: ExercisePayload, taken: Set<string>): Exercise {
  return {
    id: p.id ?? genId('ex', taken),
    name: p.name,
    sets: p.sets,
    reps: p.reps,
    load: p.load,
    notes: p.notes,
    tracking: p.tracking,
    restSec: p.restSec,
  };
}

function materialiseDay(p: DayPayload, taken: Set<string>): WorkoutDay {
  return {
    id: p.id ?? genId('day', taken),
    day: 0, // renumbered below
    title: p.title,
    exercises: p.exercises.map((e) => materialiseExercise(e, taken)),
  };
}

function materialiseWeek(p: WeekPayload, taken: Set<string>): WeekPlan {
  return {
    id: genId('wk', taken),
    weekNumber: 0, // renumbered below
    block: p.block,
    blockNote: p.blockNote,
    focus: p.focus,
    jumpsNote: p.jumpsNote,
    days: p.days.map((d) => materialiseDay(d, taken)),
  };
}

type Located = { weekIndex: number; dayIndex: number; exerciseIndex: number };

function locateExercise(weeks: WeekPlan[], exerciseId: string): Located | null {
  for (let wi = 0; wi < weeks.length; wi++)
    for (let di = 0; di < weeks[wi].days.length; di++) {
      const ei = weeks[wi].days[di].exercises.findIndex((e) => e.id === exerciseId);
      if (ei !== -1) return { weekIndex: wi, dayIndex: di, exerciseIndex: ei };
    }
  return null;
}

function locateDay(weeks: WeekPlan[], dayId: string): { weekIndex: number; dayIndex: number } | null {
  for (let wi = 0; wi < weeks.length; wi++) {
    const di = weeks[wi].days.findIndex((d) => d.id === dayId);
    if (di !== -1) return { weekIndex: wi, dayIndex: di };
  }
  return null;
}

const clamp = (n: number, max: number) => Math.max(0, Math.min(n, max));

export function applyOps(programme: Programme, ops: EditOp[], progress: ProgressMap = {}): ApplyResult {
  // Deep-clone the weeks tree once, then edit the clone in place — callers see
  // immutability; internally this keeps every op handler simple.
  let weeks: WeekPlan[] = JSON.parse(JSON.stringify(programme.weeks));
  let name = programme.name;
  const warnings: Warning[] = [];
  const taken = allIds(weeks);

  const warnLogs = (label: string, affected: boolean) => {
    if (affected) warnings.push({ code: 'logged-sets-affected', message: `${label} has logged sets this cycle — they'll no longer be shown.` });
  };

  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    const fail = (message: string): ApplyResult => ({ ok: false, errors: [{ opIndex: i, message }] });

    switch (op.type) {
      case 'update-exercise': {
        const loc = locateExercise(weeks, op.exerciseId);
        if (!loc) return fail(`No exercise with id "${op.exerciseId}".`);
        const day = weeks[loc.weekIndex].days[loc.dayIndex];
        const ex = day.exercises[loc.exerciseIndex];
        if (op.patch.name !== undefined && op.patch.name !== ex.name) {
          warnings.push({ code: 'rename-detaches-history', message: `Renaming "${ex.name}" to "${op.patch.name}" — past history and PRs stay under the old name.` });
        }
        if (op.patch.sets !== undefined && op.patch.sets < ex.sets) {
          const orphaned = Array.from({ length: ex.sets - op.patch.sets }, (_, k) => op.patch.sets! + k)
            .some((idx) => progress[`${ex.id}-${idx}`] !== undefined);
          warnLogs(`"${ex.name}"`, orphaned);
        }
        day.exercises[loc.exerciseIndex] = { ...ex, ...op.patch };
        break;
      }
      case 'add-exercise': {
        const loc = locateDay(weeks, op.dayId);
        if (!loc) return fail(`No day with id "${op.dayId}".`);
        const day = weeks[loc.weekIndex].days[loc.dayIndex];
        const ex = materialiseExercise(op.exercise, taken);
        day.exercises.splice(clamp(op.index ?? day.exercises.length, day.exercises.length), 0, ex);
        break;
      }
      case 'remove-exercise': {
        const loc = locateExercise(weeks, op.exerciseId);
        if (!loc) return fail(`No exercise with id "${op.exerciseId}".`);
        const day = weeks[loc.weekIndex].days[loc.dayIndex];
        if (day.exercises.length === 1) return fail(`Removing "${day.exercises[0].name}" would leave "${day.title}" empty — remove the day instead.`);
        warnLogs(`"${day.exercises[loc.exerciseIndex].name}"`, hasLogs(progress, op.exerciseId));
        day.exercises.splice(loc.exerciseIndex, 1);
        break;
      }
      case 'reorder-exercise': {
        const loc = locateExercise(weeks, op.exerciseId);
        if (!loc) return fail(`No exercise with id "${op.exerciseId}".`);
        const day = weeks[loc.weekIndex].days[loc.dayIndex];
        const [ex] = day.exercises.splice(loc.exerciseIndex, 1);
        day.exercises.splice(clamp(op.toIndex, day.exercises.length), 0, ex);
        break;
      }
      case 'update-day': {
        const loc = locateDay(weeks, op.dayId);
        if (!loc) return fail(`No day with id "${op.dayId}".`);
        const day = weeks[loc.weekIndex].days[loc.dayIndex];
        weeks[loc.weekIndex].days[loc.dayIndex] = { ...day, ...op.patch };
        break;
      }
      case 'replace-day': {
        const loc = locateDay(weeks, op.dayId);
        if (!loc) return fail(`No day with id "${op.dayId}".`);
        const old = weeks[loc.weekIndex].days[loc.dayIndex];
        // Payload ids may only reference ids that live inside the replaced day.
        const oldIds = new Set<string>([old.id, ...old.exercises.map((e) => e.id)]);
        const carried = [op.day.id, ...op.day.exercises.map((e) => e.id)].filter((x): x is string => !!x);
        for (const cid of carried) if (!oldIds.has(cid)) return fail(`replace-day payload reuses id "${cid}" from outside the replaced day.`);
        const droppedLogged = old.exercises.some(
          (e) => !carried.includes(e.id) && hasLogs(progress, e.id)
        );
        warnLogs(`"${old.title}"`, droppedLogged);
        warnRenamedExercises(old.exercises, op.day.exercises, warnings);
        const fresh = materialiseDay({ ...op.day, id: op.day.id ?? old.id }, taken);
        weeks[loc.weekIndex].days[loc.dayIndex] = fresh;
        break;
      }
      case 'add-day': {
        const wi = weeks.findIndex((w) => w.id === op.weekId);
        if (wi === -1) return fail(`No week with id "${op.weekId}".`);
        if (weeks[wi].days.length >= 7) return fail('A week already has 7 days.');
        const day = materialiseDay(op.day, taken);
        weeks[wi].days.splice(clamp(op.index ?? weeks[wi].days.length, weeks[wi].days.length), 0, day);
        break;
      }
      case 'remove-day': {
        const loc = locateDay(weeks, op.dayId);
        if (!loc) return fail(`No day with id "${op.dayId}".`);
        if (weeks[loc.weekIndex].days.length === 1) return fail('Removing the last day would leave the week empty — remove the week instead.');
        const day = weeks[loc.weekIndex].days[loc.dayIndex];
        warnLogs(`"${day.title}"`, dayHasLogs(progress, day));
        weeks[loc.weekIndex].days.splice(loc.dayIndex, 1);
        break;
      }
      case 'move-day': {
        const loc = locateDay(weeks, op.dayId);
        if (!loc) return fail(`No day with id "${op.dayId}".`);
        const days = weeks[loc.weekIndex].days;
        const [day] = days.splice(loc.dayIndex, 1);
        days.splice(clamp(op.toIndex, days.length), 0, day);
        break;
      }
      case 'update-week': {
        const wi = weeks.findIndex((w) => w.id === op.weekId);
        if (wi === -1) return fail(`No week with id "${op.weekId}".`);
        weeks[wi] = { ...weeks[wi], ...op.patch };
        break;
      }
      case 'replace-week': {
        const wi = weeks.findIndex((w) => w.id === op.weekId);
        if (wi === -1) return fail(`No week with id "${op.weekId}".`);
        const old = weeks[wi];
        const oldIds = new Set<string>();
        for (const d of old.days) {
          oldIds.add(d.id);
          for (const e of d.exercises) oldIds.add(e.id);
        }
        const carried: string[] = [];
        for (const d of op.week.days) {
          if (d.id) carried.push(d.id);
          for (const e of d.exercises) if (e.id) carried.push(e.id);
        }
        for (const cid of carried) if (!oldIds.has(cid)) return fail(`replace-week payload reuses id "${cid}" from outside the replaced week.`);
        const droppedLogged = old.days.some((d) =>
          d.exercises.some((e) => !carried.includes(e.id) && hasLogs(progress, e.id))
        );
        warnLogs(`Week ${old.weekNumber}`, droppedLogged);
        warnRenamedExercises(
          old.days.flatMap((d) => d.exercises),
          op.week.days.flatMap((d) => d.exercises),
          warnings
        );
        const fresh = materialiseWeek(op.week, taken);
        weeks[wi] = { ...fresh, id: old.id };
        break;
      }
      case 'remove-week': {
        const wi = weeks.findIndex((w) => w.id === op.weekId);
        if (wi === -1) return fail(`No week with id "${op.weekId}".`);
        if (weeks.length === 1) return fail('Cannot remove the only week in the programme.');
        warnings.push({ code: 'remove-week', message: `Removing week ${weeks[wi].weekNumber} ("${weeks[wi].focus}").` });
        weeks.splice(wi, 1);
        break;
      }
      case 'update-programme': {
        name = op.patch.name;
        break;
      }
      case 'append-weeks': {
        for (const wp of op.weeks) weeks.push(materialiseWeek(wp, taken));
        break;
      }
      default:
        return fail('Unknown op type');
    }
  }

  weeks = renumber(weeks);

  // Global id-uniqueness backstop: a payload bug must never create colliding
  // ids — set logs key off them.
  const seen = new Set<string>();
  for (const w of weeks) {
    for (const id of [w.id, ...w.days.flatMap((d) => [d.id, ...d.exercises.map((e) => e.id)])]) {
      if (seen.has(id)) return { ok: false, errors: [{ opIndex: -1, message: `Duplicate id "${id}" after applying ops.` }] };
      seen.add(id);
    }
  }

  return {
    ok: true,
    warnings,
    programme: { ...programme, name, weeks, revision: programme.revision + 1 },
  };
}
