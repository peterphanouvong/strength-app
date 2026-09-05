import { WebHaptics } from 'web-haptics';

// ---------- Haptics ----------

let hapticsInstance: WebHaptics | null = null;

function getHaptics(): WebHaptics {
  if (!hapticsInstance) hapticsInstance = new WebHaptics();
  return hapticsInstance;
}

type HapticInput = Parameters<WebHaptics['trigger']>[0];

export function haptic(input: HapticInput) {
  try {
    getHaptics().trigger(input);
  } catch {
    // haptics are a nice-to-have; never let them break the app
  }
}

export const hapticTap = () => haptic(15); // generic button press
export const hapticSelect = () => haptic(30); // choosing something / starting something
export const hapticSetDone = () => haptic(40);
export const hapticSetUndone = () => haptic(15);
export const hapticExerciseDone = () => haptic('success');
export const hapticNewBest = () => haptic('success'); // new personal best — exercise-done tier
export const hapticWorkoutDone = () => haptic('nudge');
export const hapticRestOver = () => haptic('error'); // three sharp taps — attention

// ---------- Sounds (WebAudio, no assets) ----------

let audioCtx: AudioContext | null = null;

/** Call from a user gesture (tap) so later, non-gesture sounds are allowed to play. */
export function unlockAudio() {
  try {
    if (!audioCtx) {
      const Ctor = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
      if (!Ctor) return;
      audioCtx = new Ctor();
    }
    if (audioCtx.state === 'suspended') void audioCtx.resume();
  } catch {
    audioCtx = null;
  }
}

function tone(freq: number, startIn: number, duration: number, peak = 0.12) {
  if (!audioCtx || audioCtx.state !== 'running') return;
  const t0 = audioCtx.currentTime + startIn;
  const osc = audioCtx.createOscillator();
  const gain = audioCtx.createGain();
  osc.type = 'sine';
  osc.frequency.value = freq;
  gain.gain.setValueAtTime(0.0001, t0);
  gain.gain.exponentialRampToValueAtTime(peak, t0 + 0.015);
  gain.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(gain).connect(audioCtx.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.05);
}

/** Soft blip when a set is ticked. */
export function playSetDone() {
  tone(880, 0, 0.09, 0.08);
}

/** Rising two-note ding when rest is over. */
export function playRestOver() {
  tone(660, 0, 0.15);
  tone(988, 0.16, 0.3);
}

/** Short major arpeggio for finishing a workout. */
export function playWorkoutDone() {
  tone(523.25, 0, 0.14); // C5
  tone(659.25, 0.12, 0.14); // E5
  tone(783.99, 0.24, 0.32, 0.14); // G5
}

// ---------- Notifications ----------

export function notificationsSupported(): boolean {
  return 'Notification' in window && 'serviceWorker' in navigator;
}

export function notificationPermission(): NotificationPermission | 'unsupported' {
  return notificationsSupported() ? Notification.permission : 'unsupported';
}

export async function requestNotifications(): Promise<NotificationPermission | 'unsupported'> {
  if (!notificationsSupported()) return 'unsupported';
  return Notification.requestPermission();
}

/**
 * Hand rest-expiry alerting to the service worker (public/sw-rest-timer.js).
 * The page's own interval is frozen while a backgrounded PWA is suspended, so
 * the worker — which keeps running — must own the "fire at endsAt" schedule.
 * Not gated on permission here: the worker checks at fire time, so granting
 * mid-rest (via "Notify me when rest ends") still works.
 */
export async function scheduleRestOverNotification(endsAt: number, exerciseName: string) {
  try {
    if (!('serviceWorker' in navigator)) return;
    const reg = await navigator.serviceWorker.ready;
    reg.active?.postMessage({ type: 'schedule-rest-notification', endsAt, label: exerciseName });
  } catch {
    // notifications are best-effort
  }
}

/** Cancel a pending service-worker rest-expiry notification (rest skipped). */
export async function cancelRestOverNotification() {
  try {
    if (!('serviceWorker' in navigator)) return;
    const reg = await navigator.serviceWorker.ready;
    reg.active?.postMessage({ type: 'cancel-rest-notification' });
  } catch {
    // notifications are best-effort
  }
}

/** Best-effort local notification via the service worker (works in installed PWAs). */
export async function notifyRestOver(exerciseName: string) {
  try {
    if (notificationPermission() !== 'granted') return;
    const reg = await navigator.serviceWorker.ready;
    await reg.showNotification('Rest over — back to work', {
      body: exerciseName,
      icon: '/pwa-192x192.png',
      badge: '/pwa-192x192.png',
      tag: 'rest-timer',
    });
  } catch {
    // notifications are best-effort
  }
}
