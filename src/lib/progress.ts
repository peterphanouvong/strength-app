import { WorkoutDay, WeekPlan } from '../data';

export type SetType = 'W' | 'F' | 'D'; // warm-up, failure, drop (absent = normal)

export type SetLog = {
  completed: boolean;
  weight?: string;
  actualReps?: string;
  timeSec?: string;
  setType?: SetType;
};

export type ProgressMap = Record<string, SetLog>;

export const PROGRESS_KEY = 'volleyball-workout-progress-v3';

export type Progress = { total: number; completed: number; percentage: number };

/**
 * Remove set `setIndex`'s log for one exercise and shift every later set's log
 * up by one, so logged weights stay attached to the right rows after an inline
 * set deletion. Pure — returns a new map. `sets` is the count BEFORE deletion.
 */
export function removeSetLogAt(
  progress: ProgressMap,
  exerciseId: string,
  setIndex: number,
  sets: number
): ProgressMap {
  const next: ProgressMap = { ...progress };
  delete next[`${exerciseId}-${setIndex}`];
  for (let i = setIndex + 1; i < sets; i++) {
    const log = next[`${exerciseId}-${i}`];
    delete next[`${exerciseId}-${i}`];
    if (log) next[`${exerciseId}-${i - 1}`] = log;
  }
  return next;
}

export function getDayProgress(day: WorkoutDay, sets: ProgressMap): Progress {
  let total = 0;
  let completed = 0;
  day.exercises.forEach((ex) => {
    total += ex.sets;
    for (let i = 0; i < ex.sets; i++) {
      if (sets[`${ex.id}-${i}`]?.completed) completed++;
    }
  });
  return { total, completed, percentage: total === 0 ? 0 : Math.round((completed / total) * 100) };
}

/** Total kg lifted across completed weighted sets (weight × reps, falling back to the target reps). */
export function getDayVolume(day: WorkoutDay, sets: ProgressMap): number {
  let volume = 0;
  day.exercises.forEach((ex) => {
    if (ex.tracking !== 'weighted') return;
    const targetReps = parseInt(ex.reps, 10) || 0;
    for (let i = 0; i < ex.sets; i++) {
      const log = sets[`${ex.id}-${i}`];
      if (!log?.completed) continue;
      const weight = parseFloat(log.weight || '');
      const reps = parseInt(log.actualReps || '', 10) || targetReps;
      if (weight > 0 && reps > 0) volume += weight * reps;
    }
  });
  return volume;
}

export function getWeekProgress(week: WeekPlan, sets: ProgressMap): Progress {
  let total = 0;
  let completed = 0;
  week.days.forEach((day) => {
    const p = getDayProgress(day, sets);
    total += p.total;
    completed += p.completed;
  });
  return { total, completed, percentage: total === 0 ? 0 : Math.round((completed / total) * 100) };
}
