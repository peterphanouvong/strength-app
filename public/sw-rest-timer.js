// Rest-timer notification scheduling, imported into the generated Workbox
// service worker (vite.config.ts → workbox.importScripts). The page's rest
// interval (src/lib/rest.ts) is frozen when the installed PWA is backgrounded,
// so the page posts the rest's endsAt here when it starts and this worker —
// which keeps running while the page is suspended — fires the notification.
//
// The fire is delayed by a short grace window: whenever the page is actually
// running at expiry, its own tick handles the feedback (chime/haptic, and
// notifyRestOver when hidden) and cancels this schedule within the grace — so
// the worker only ever notifies when the page was suspended and its tick never
// ran, keeping foreground behavior exactly as before.

const GRACE_MS = 750;

let restTimer = null;
let releaseRestWait = null;

function clearRestTimer() {
  if (restTimer !== null) {
    clearTimeout(restTimer);
    restTimer = null;
  }
  if (releaseRestWait) {
    releaseRestWait();
    releaseRestWait = null;
  }
}

self.addEventListener('message', (event) => {
  const data = event.data;
  if (!data || typeof data !== 'object') return;

  if (data.type === 'cancel-rest-notification') {
    clearRestTimer();
    return;
  }
  if (data.type !== 'schedule-rest-notification') return;

  clearRestTimer();
  const done = new Promise((resolve) => {
    releaseRestWait = resolve;
  });
  restTimer = setTimeout(async () => {
    restTimer = null;
    try {
      // Permission is checked here at fire time (showNotification rejects
      // without it), so granting mid-rest still gets the alert.
      await self.registration.showNotification('Rest over — back to work', {
        body: data.label,
        icon: '/pwa-192x192.png',
        badge: '/pwa-192x192.png',
        tag: 'rest-timer',
      });
    } catch {
      // notifications are best-effort
    } finally {
      if (releaseRestWait) {
        releaseRestWait();
        releaseRestWait = null;
      }
    }
  }, Math.max(0, data.endsAt + GRACE_MS - Date.now()));
  // Keep the worker alive until the notification fires or is cancelled.
  event.waitUntil(done);
});
