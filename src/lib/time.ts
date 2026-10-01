// Shared time-formatting helper. Lives here (not in a page component) so it
// can be imported without creating a circular dependency between pages and
// components that both need it (e.g. EditExerciseSheet <-> WorkoutPage).
export function formatElapsed(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  if (m >= 60) {
    const h = Math.floor(m / 60);
    return `${h}h ${m % 60}m`;
  }
  return `${m}:${String(s).padStart(2, '0')}`;
}
