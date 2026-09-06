import { test, expect } from '@playwright/test';

const THEME_KEY = 'vb-theme-v1';

const bodyBg = (page: import('@playwright/test').Page) =>
  page.evaluate(() => getComputedStyle(document.body).backgroundColor);

// Court default ground #2a2ae0 / Midnight ground #131316.
const COURT_BG = 'rgb(42, 42, 224)';
const MIDNIGHT_BG = 'rgb(19, 19, 22)';

test.describe('themes', () => {
  test('default theme is Court: ground color and no data-theme override needed', async ({ page }) => {
    await page.goto('/');
    expect(await bodyBg(page)).toBe(COURT_BG);
  });

  test('picking Midnight in Profile swaps colors instantly and persists across reload', async ({ page }) => {
    await page.goto('/profile');
    await page.getByRole('button', { name: /^Theme/ }).click();
    const sheet = page.getByRole('dialog', { name: 'Theme' });
    await sheet.getByRole('button', { name: /Midnight/ }).click();

    // Hot swap: no navigation, ground changes immediately.
    expect(await bodyBg(page)).toBe(MIDNIGHT_BG);
    await expect(sheet.getByRole('button', { name: /Midnight/ })).toHaveAttribute('aria-pressed', 'true');

    // Persisted with vars for the pre-paint boot script.
    const stored = await page.evaluate((k) => JSON.parse(window.localStorage.getItem(k) || 'null'), THEME_KEY);
    expect(stored.id).toBe('midnight');
    expect(stored.vars.surface).toBe('#131316');

    await page.reload();
    expect(await bodyBg(page)).toBe(MIDNIGHT_BG);

    // Meta theme-color follows the ground.
    const meta = await page.getAttribute('meta[name="theme-color"]', 'content');
    expect(meta?.toLowerCase()).toBe('#131316');
  });

  test('theme applies on every route, not just Profile', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'vb-theme-v1',
        JSON.stringify({
          id: 'midnight',
          vars: { surface: '#131316', surfaceDeep: '#000000', primary: '#4ade80', accent: '#fbbf24', secondary: '#a1a1aa', danger: '#f87171' },
        })
      );
    });
    for (const route of ['/', '/programme', '/week/1', '/workout/w1-d1']) {
      await page.goto(route);
      expect(await bodyBg(page), `route ${route}`).toBe(MIDNIGHT_BG);
    }
  });

  test('switching back to Court restores the default palette', async ({ page }) => {
    await page.goto('/profile');
    await page.getByRole('button', { name: /^Theme/ }).click();
    const sheet = page.getByRole('dialog', { name: 'Theme' });
    await sheet.getByRole('button', { name: /Midnight/ }).click();
    expect(await bodyBg(page)).toBe(MIDNIGHT_BG);
    await sheet.getByRole('button', { name: /Court/ }).click();
    expect(await bodyBg(page)).toBe(COURT_BG);
  });

  test('corrupt theme storage falls back to Court without crashing', async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem('vb-theme-v1', '{not json'));
    await page.goto('/');
    expect(await bodyBg(page)).toBe(COURT_BG);
    await expect(page.getByRole('link', { name: /Current week/i })).toBeVisible();
  });

  test('completed set rows read correctly under a non-default theme', async ({ page }) => {
    await page.addInitScript(() => {
      window.localStorage.setItem(
        'vb-theme-v1',
        JSON.stringify({
          id: 'midnight',
          vars: { surface: '#131316', surfaceDeep: '#000000', primary: '#4ade80', accent: '#fbbf24', secondary: '#a1a1aa', danger: '#f87171' },
        })
      );
    });
    await page.goto('/workout/w1-d1');
    await page.getByRole('button', { name: 'Start workout' }).click();
    await page.getByRole('button', { name: 'Mark set complete' }).first().click();
    // The completed check tile uses the theme's primary.
    const check = page.getByRole('button', { name: 'Mark set incomplete' }).first();
    // toHaveCSS polls — rides out the 200ms transition-colors on completion.
    await expect(check).toHaveCSS('background-color', 'rgb(74, 222, 128)'); // #4ade80
  });
});
