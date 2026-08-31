import { hapticRestOver, playRestOver, notifyRestOver } from './feedback';

export type RestState = { endsAt: number; total: number; label: string };

// The rest countdown lives at module level, not in WorkoutPage state: in-app
// navigation (back to /week/N and into another route) unmounts WorkoutPage,
// and a component-owned interval would be destroyed mid-rest — no bar on
// return, and the expiry haptic/sound/notification would never fire. Module
// scope survives route changes in the SPA, so the timer keeps ticking and the
// expiry feedback fires no matter which page is mounted. Components subscribe
// via useSyncExternalStore (subscribeRest + getRest/getRestRemaining).

let rest: RestState | null = null;
let remaining = 0;
let interval: number | null = null;
const listeners = new Set<() => void>();

function emit() {
  for (const listener of listeners) listener();
}

function stopInterval() {
  if (interval !== null) {
    window.clearInterval(interval);
    interval = null;
  }
}

function tick() {
  if (!rest) return;
  const next = Math.ceil((rest.endsAt - Date.now()) / 1000);
  if (next <= 0) {
    const { label } = rest;
    rest = null;
    remaining = 0;
    stopInterval();
    hapticRestOver();
    playRestOver();
    if (document.visibilityState !== 'visible') void notifyRestOver(label);
  } else {
    remaining = next;
  }
  emit();
}

/** Start (or replace) the running rest countdown. */
export function startRest(state: RestState) {
  rest = state;
  remaining = Math.max(0, Math.ceil((state.endsAt - Date.now()) / 1000));
  stopInterval();
  interval = window.setInterval(tick, 250);
  emit();
}

/** Add seconds to the running countdown (no-op when none is running). */
export function extendRest(seconds: number) {
  if (!rest) return;
  rest = { ...rest, endsAt: rest.endsAt + seconds * 1000, total: rest.total + seconds };
  tick();
}

/** Dismiss the running countdown without expiry feedback. */
export function skipRest() {
  if (!rest) return;
  rest = null;
  remaining = 0;
  stopInterval();
  emit();
}

export function subscribeRest(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function getRest(): RestState | null {
  return rest;
}

export function getRestRemaining(): number {
  return remaining;
}
