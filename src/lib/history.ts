// Saved-workout history — the additive vb-workout-history-v1 store plus the
// month-grid and streak derivations built on it
// (docs/superpowers/specs/2026-09-05-consumer-flows-design.md).

export type CompletedWorkout = {
  id: string; // `${dayId}-${completedAt}`
  dayId: string;
  weekNum: number;
  dayTitle: string;
  completedAt: number; // epoch ms, written at Save
  elapsed: number; // seconds
  volume: number; // kg
  setsDone: number;
  totalSets: number;
  note?: string;
  title?: string; // user-edited on the save screen
};

export const HISTORY_KEY = 'vb-workout-history-v1';

/**
 * Guard for values read from storage: history must be an array, and every
 * consumer relies on dayId + completedAt. Anything else is dropped, never thrown.
 */
export function coerceHistory(value: unknown): CompletedWorkout[] {
  if (!Array.isArray(value)) return [];
  return value.filter(
    (e): e is CompletedWorkout =>
      !!e &&
      typeof e === 'object' &&
      typeof (e as CompletedWorkout).dayId === 'string' &&
      typeof (e as CompletedWorkout).completedAt === 'number'
  );
}

export function getHistory(): CompletedWorkout[] {
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    return raw ? coerceHistory(JSON.parse(raw)) : [];
  } catch {
    return [];
  }
}

export function appendWorkout(entry: CompletedWorkout): CompletedWorkout[] {
  const next = [...getHistory(), entry];
  window.localStorage.setItem(HISTORY_KEY, JSON.stringify(next));
  return next;
}

/** The name shown for a saved workout: the user's title, else the plan's day name. */
export function workoutDisplayTitle(entry: CompletedWorkout): string {
  return entry.title || entry.dayTitle.split(': ')[1] || entry.dayTitle;
}

// ---------- calendar / streak derivation ----------

/** Monday 00:00 local of the week containing `t`. */
export function startOfWeek(t: number): number {
  const d = new Date(t);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d.getTime();
}

function addDays(t: number, days: number): number {
  const d = new Date(t);
  d.setDate(d.getDate() + days);
  return d.getTime();
}

/** Local-date key so saved discs line up with calendar cells in any timezone. */
function dateKey(t: number | Date): string {
  const d = new Date(t);
  return `${d.getFullYear()}-${d.getMonth()}-${d.getDate()}`;
}

/**
 * Streak = consecutive calendar weeks (Mon-start) containing ≥1 saved workout,
 * counted backward starting from the current week. Grace: the current week may
 * still be empty without breaking the streak (you haven't failed a week that
 * isn't over) — but a fully empty *prior* week breaks it.
 */
export function getWeekStreak(history: CompletedWorkout[], now = Date.now()): number {
  const weeks = new Set(history.map((h) => startOfWeek(h.completedAt)));
  let week = startOfWeek(now);
  if (!weeks.has(week)) week = startOfWeek(addDays(week, -7)); // current-week grace
  let streak = 0;
  while (weeks.has(week)) {
    streak++;
    week = startOfWeek(addDays(week, -7));
  }
  return streak;
}

export type CalendarCell = {
  date: Date;
  inMonth: boolean;
  saved: boolean;
  today: boolean;
};

/** Mon-start week rows covering `monthDate`'s month, flagged with saved/today. */
export function getMonthGrid(
  monthDate: Date,
  history: CompletedWorkout[],
  now = new Date()
): CalendarCell[][] {
  const saved = new Set(history.map((h) => dateKey(h.completedAt)));
  const todayKey = dateKey(now);
  const month = monthDate.getMonth();
  let cursor = startOfWeek(new Date(monthDate.getFullYear(), month, 1).getTime());
  const rows: CalendarCell[][] = [];
  do {
    const row: CalendarCell[] = [];
    for (let i = 0; i < 7; i++) {
      const date = new Date(cursor);
      const key = dateKey(date);
      row.push({
        date,
        inMonth: date.getMonth() === month,
        saved: saved.has(key),
        today: key === todayKey,
      });
      cursor = addDays(cursor, 1);
    }
    rows.push(row);
  } while (new Date(cursor).getMonth() === month);
  return rows;
}
