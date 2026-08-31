import {
  hapticRestOver,
  playRestOver,
  notifyRestOver,
  scheduleRestOverNotification,
  cancelRestOverNotification,
} from './feedback';

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
    // This tick ran, so the page is awake and the feedback above covered
    // expiry — call off the service-worker backstop before its grace window
    // ends. When a backgrounded PWA is frozen, this tick never runs and the
    // worker (public/sw-rest-timer.js) fires the notification instead.
    void cancelRestOverNotification();
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
  // The interval above stops running when a backgrounded PWA is frozen, so the
  // expiry notification is scheduled in the service worker, which stays awake.
  void scheduleRestOverNotification(state.endsAt, state.label);
  emit();
}

/** Add seconds to the running countdown (no-op when none is running). */
export function extendRest(seconds: number) {
  if (!rest) return;
  rest = { ...rest, endsAt: rest.endsAt + seconds * 1000, total: rest.total + seconds };
  void scheduleRestOverNotification(rest.endsAt, rest.label);
  tick();
}

/** Dismiss the running countdown without expiry feedback. */
export function skipRest() {
  if (!rest) return;
  rest = null;
  remaining = 0;
  stopInterval();
  void cancelRestOverNotification();
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
