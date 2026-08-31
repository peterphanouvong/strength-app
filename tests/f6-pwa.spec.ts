import { test, expect, type Page } from '@playwright/test';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { seedStorage, canonicalW1D1 } from './helpers/fixtures';

// F6 — PWA integrity (docs/gauntlet/ANSWER_KEY.md).
// Runs against the production build served by vite preview (playwright.config.ts).

const DIST = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../dist');

/** Load `/` and wait until the service worker is active AND controlling the page,
 *  so subsequent (offline) navigations are handled by the SW. */
async function activateServiceWorker(page: Page) {
  await page.goto('/');
  await page.evaluate(async () => {
    await navigator.serviceWorker.ready;
  });
  // sw.js calls skipWaiting() + clientsClaim(), so the controller appears without a reload.
  await page.waitForFunction(() => navigator.serviceWorker.controller !== null);
}

/** Every URL currently stored in any CacheStorage cache of the page's origin. */
async function cachedUrls(page: Page): Promise<string[]> {
  return page.evaluate(async () => {
    const names = await caches.keys();
    const urls: string[] = [];
    for (const name of names) {
      const cache = await caches.open(name);
      for (const req of await cache.keys()) urls.push(req.url);
    }
    return urls;
  });
}

test.describe('F6 — PWA integrity', () => {
  test('dist/manifest.webmanifest parses: name, short_name, theme_color #2a2ae0, display standalone, 192/512/maskable icons declared', async ({
    request,
  }) => {
    // The file exists in dist and parses as JSON.
    const distManifest = path.join(DIST, 'manifest.webmanifest');
    expect(fs.existsSync(distManifest)).toBe(true);
    expect(() => JSON.parse(fs.readFileSync(distManifest, 'utf8'))).not.toThrow();

    // The served copy parses to the same required fields.
    const res = await request.get('/manifest.webmanifest');
    expect(res.status()).toBe(200);
    const manifest = JSON.parse(await res.text());

    expect(manifest.name).toBeTruthy();
    expect(manifest.short_name).toBeTruthy();
    expect(manifest.theme_color).toBe('#2a2ae0');
    expect(manifest.display).toBe('standalone');

    const icons: Array<{ src: string; sizes: string; type: string; purpose?: string }> =
      manifest.icons;
    expect(Array.isArray(icons)).toBe(true);
    expect(icons.some((i) => i.sizes === '192x192')).toBe(true);
    expect(icons.some((i) => i.sizes === '512x512')).toBe(true);
    expect(icons.some((i) => i.purpose === 'maskable' && i.sizes === '512x512')).toBe(true);
  });

  test('manifest icons (192/512/maskable) are present in dist and return 200', async ({
    request,
  }) => {
    const res = await request.get('/manifest.webmanifest');
    expect(res.status()).toBe(200);
    const manifest = JSON.parse(await res.text());
    const icons: Array<{ src: string; type: string }> = manifest.icons;
    expect(icons.length).toBeGreaterThanOrEqual(3);

    for (const icon of icons) {
      // Present as a real file in dist/
      const onDisk = path.join(DIST, icon.src.replace(/^\//, ''));
      expect(fs.existsSync(onDisk), `${icon.src} missing from dist`).toBe(true);
      expect(fs.statSync(onDisk).size).toBeGreaterThan(0);

      // Served with a 200 and an image content-type
      const iconRes = await request.get(icon.src);
      expect(iconRes.status(), `${icon.src} did not return 200`).toBe(200);
      expect(iconRes.headers()['content-type']).toContain('image/png');
    }
  });

  test('service worker registers on preview', async ({ page }) => {
    await activateServiceWorker(page);
    const state = await page.evaluate(async () => {
      const reg = await navigator.serviceWorker.getRegistration();
      return reg?.active?.state ?? null;
    });
    expect(state).toBe('activated');
  });

  test('precache includes the app shell: index.html, JS, CSS', async ({ page }) => {
    await activateServiceWorker(page);
    const urls = await cachedUrls(page);

    expect(urls.some((u) => u.includes('index.html'))).toBe(true);
    expect(urls.some((u) => /\/assets\/[^/]+\.js/.test(u))).toBe(true);
    expect(urls.some((u) => /\/assets\/[^/]+\.css/.test(u))).toBe(true);
  });

  test('offline: /, /week/1, /workout/w1-d1, /complete/w1-d1 all render app UI (SPA deep links fall back to the app shell)', async ({
    page,
    context,
  }) => {
    // Seed real data so each page shows genuine UI, then install the SW while online.
    await seedStorage(page, { progress: canonicalW1D1() });
    await activateServiceWorker(page);

    await context.setOffline(true);

    // Guard against a false pass: the network really is off — a file that exists in dist
    // but is NOT precached (icon.svg) must fail to fetch while offline.
    const nonPrecachedFetch = await page.evaluate(async () => {
      try {
        const r = await fetch('/icon.svg', { cache: 'no-store' });
        return r.ok ? 'ok' : `status ${r.status}`;
      } catch {
        return 'network error';
      }
    });
    expect(nonPrecachedFetch).toBe('network error');

    // Each goto is a full document request; offline it must be served by the SW's
    // navigation fallback (app shell), not the browser error page.
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /12-week/i })).toBeVisible();

    await page.goto('/week/1');
    await expect(page.getByRole('heading', { name: 'Week 1' })).toBeVisible();

    await page.goto('/workout/w1-d1');
    await expect(page.getByText('Hang Power Clean')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Finish' })).toBeVisible();

    await page.goto('/complete/w1-d1');
    await expect(page.getByRole('heading', { name: /nice\s*work/i })).toBeVisible();
    await expect(page.getByText(/Week 1 · Lower Strength/)).toBeVisible();
  });

  test('offline with Google Fonts unavailable: app still renders (no infinite spinner or blank screen)', async ({
    page,
    context,
  }) => {
    await activateServiceWorker(page);
    await context.setOffline(true);

    // Full reload offline: the render-blocking Google Fonts stylesheet now fails.
    // The app shell must come from the SW and paint real content with a fallback font.
    await page.goto('/');
    await expect(page.getByRole('heading', { name: /12-week/i })).toBeVisible({ timeout: 10_000 });

    // Not a blank shell: the root actually has rendered content.
    const textLength = await page.evaluate(
      () => document.getElementById('root')?.innerText.trim().length ?? 0
    );
    expect(textLength).toBeGreaterThan(20);

    // Google Fonts is genuinely not cached/available offline — the document still rendered.
    const fontsCached = (await cachedUrls(page)).some((u) => u.includes('fonts.googleapis.com'));
    expect(fontsCached).toBe(false);
  });
});
