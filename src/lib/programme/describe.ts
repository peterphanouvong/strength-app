import { Exercise, WeekPlan } from '../../data';
import { Programme } from './types';
import { EditOp } from './ops';

const rx = (e: { sets: number; reps: string; load?: string }) =>
  `${e.sets}×${e.reps}${e.load ? ` @ ${e.load}` : ''}`;

const dayLetter = (title: string) => title.split(':')[0];

function find(weeks: WeekPlan[], exerciseId: string) {
  for (const w of weeks)
    for (const d of w.days) {
      const e = d.exercises.find((x) => x.id === exerciseId);
      if (e) return { w, d, e };
    }
  return null;
}

function findDay(weeks: WeekPlan[], dayId: string) {
  for (const w of weeks) {
    const d = w.days.find((x) => x.id === dayId);
    if (d) return { w, d };
  }
  return null;
}

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;

/** One human-readable line per op, against the PRE-edit programme. */
export function describeOps(ops: EditOp[], programme: Programme): string[] {
  const weeks = programme.weeks;
  return ops.map((op) => {
    switch (op.type) {
      case 'update-exercise': {
        const hit = find(weeks, op.exerciseId);
        if (!hit) return `Edit exercise ${op.exerciseId} (not found)`;
        const { w, d, e } = hit;
        const next: Exercise = { ...e, ...op.patch };
        const where = `Week ${w.weekNumber}, ${dayLetter(d.title)}`;
        if (op.patch.name && op.patch.name !== e.name) return `${where}: renamed ${e.name} → ${op.patch.name}`;
        if (op.patch.restSec !== undefined && op.patch.sets === undefined && op.patch.reps === undefined && op.patch.load === undefined)
          return `${where}: ${e.name} — rest ${e.restSec}s → ${op.patch.restSec}s`;
        return `${where}: ${e.name} — ${rx(e)} → ${rx(next)}`;
      }
      case 'add-exercise': {
        const hit = findDay(weeks, op.dayId);
        return `Added ${op.exercise.name} (${rx(op.exercise)}) to ${hit ? `week ${hit.w.weekNumber}, ${dayLetter(hit.d.title)}` : op.dayId}`;
      }
      case 'remove-exercise': {
        const hit = find(weeks, op.exerciseId);
        if (!hit) return `Remove exercise ${op.exerciseId} (not found)`;
        return `Removed ${hit.e.name} from week ${hit.w.weekNumber}, ${dayLetter(hit.d.title)}`;
      }
      case 'reorder-exercise': {
        const hit = find(weeks, op.exerciseId);
        return hit ? `Moved ${hit.e.name} to position ${op.toIndex + 1} in ${dayLetter(hit.d.title)}` : `Reorder ${op.exerciseId} (not found)`;
      }
      case 'update-day': {
        const hit = findDay(weeks, op.dayId);
        return hit ? `Renamed ${hit.d.title} → ${op.patch.title}` : `Rename day ${op.dayId} (not found)`;
      }
      case 'replace-day': {
        const hit = findDay(weeks, op.dayId);
        return hit
          ? `Replaced week ${hit.w.weekNumber} ${dayLetter(hit.d.title)} (${plural(hit.d.exercises.length, 'exercise')} → ${plural(op.day.exercises.length, 'exercise')}): ${op.day.title}`
          : `Replace day ${op.dayId} (not found)`;
      }
      case 'add-day': {
        const w = weeks.find((x) => x.id === op.weekId);
        return `Added ${op.day.title} to week ${w ? w.weekNumber : op.weekId}`;
      }
      case 'remove-day': {
        const hit = findDay(weeks, op.dayId);
        return hit ? `Removed ${hit.d.title} from week ${hit.w.weekNumber}` : `Remove day ${op.dayId} (not found)`;
      }
      case 'move-day': {
        const hit = findDay(weeks, op.dayId);
        return hit ? `Moved ${hit.d.title} to position ${op.toIndex + 1} in week ${hit.w.weekNumber}` : `Move day ${op.dayId} (not found)`;
      }
      case 'update-week': {
        const w = weeks.find((x) => x.id === op.weekId);
        return `Updated week ${w ? w.weekNumber : op.weekId} notes`;
      }
      case 'replace-week': {
        const w = weeks.find((x) => x.id === op.weekId);
        return w
          ? `Replaced week ${w.weekNumber} (${plural(w.days.length, 'day')} → ${plural(op.week.days.length, 'day')}): ${op.week.focus}`
          : `Replace week ${op.weekId} (not found)`;
      }
      case 'remove-week': {
        const w = weeks.find((x) => x.id === op.weekId);
        return `Removed week ${w ? w.weekNumber : op.weekId}`;
      }
      case 'update-programme':
        return `Renamed programme → ${op.patch.name}`;
      case 'append-weeks':
        return `Added ${plural(op.weeks.length, 'week')} to the end of the programme`;
    }
  });
}
