import { test, expect } from '@playwright/test';
import { seedStorage, canonicalW1D1, partialW1D1, squatHistory3Weeks } from './helpers/fixtures';

// Screenshot rig for the visual gauntlet. Produces one 390×844 shot per V-unit state.
// Output dir override: SHOT_DIR=docs/gauntlet/shots/candidate npx playwright test shots
const DIR = process.env.SHOT_DIR || 'docs/gauntlet/shots/current';
const shot = (name: string) => `${DIR}/${name}.png`;

// Let entrance animations finish before shooting.
const settle = async (page: import('@playwright/test').Page, ms = 900) => {
  await page.waitForTimeout(ms);
};

test.describe('shots', () => {
  test('V1 weeks list', async ({ page }) => {
    await seedStorage(page, { progress: canonicalW1D1() });
    await page.goto('/');
    await settle(page);
    await page.screenshot({ path: shot('v1-weeks'), fullPage: false });
  });

  test('V2 week detail', async ({ page }) => {
    await seedStorage(page, { progress: partialW1D1() });
    await page.goto('/week/1');
    await settle(page);
    await page.screenshot({ path: shot('v2-week-detail') });
  });

  test('V3 workout session', async ({ page }) => {
    await seedStorage(page, {
      progress: partialW1D1(),
      session: { dayId: 'w1-d1', startedAt: Date.now() - 8 * 60_000 },
    });
    await page.goto('/workout/w1-d1');
    await settle(page);
    await page.screenshot({ path: shot('v3-workout') });
  });

  test('V4 completion', async ({ page }) => {
    await seedStorage(page, { progress: canonicalW1D1() });
    await page.goto('/workout/w1-d1');
    await settle(page);
    await page.getByRole('button', { name: 'Finish' }).click();
    await expect(page).toHaveURL(/\/complete\/w1-d1/);
    await settle(page, 1200);
    await page.screenshot({ path: shot('v4-completion') });
  });

  test('V5a set type sheet', async ({ page }) => {
    await seedStorage(page, { progress: partialW1D1() });
    await page.goto('/workout/w1-d1');
    await settle(page);
    await page.getByRole('button', { name: 'Change set type' }).first().click();
    await settle(page, 600);
    await page.screenshot({ path: shot('v5a-set-type-sheet') });
  });

  test('V5b rest config sheet', async ({ page }) => {
    await seedStorage(page, { progress: partialW1D1() });
    await page.goto('/workout/w1-d1');
    await settle(page);
    await page.getByRole('button', { name: /Rest timer:/ }).first().click();
    await settle(page, 600);
    await page.screenshot({ path: shot('v5b-rest-sheet') });
  });

  test('V5c exercise history sheet', async ({ page }) => {
    await seedStorage(page, { progress: squatHistory3Weeks() });
    await page.goto('/workout/w4-d1');
    await settle(page);
    await page.getByRole('button', { name: /Back Squat/ }).first().click();
    await settle(page, 600);
    await page.screenshot({ path: shot('v5c-history-sheet') });
  });

  test('V6a rest countdown bar', async ({ page }) => {
    await seedStorage(page, {});
    await page.goto('/workout/w1-d1');
    await settle(page);
    // Tick the first set to auto-start rest (Hang Power Clean, 180s).
    await page.getByRole('button', { name: 'Mark set complete' }).first().click();
    await settle(page, 700);
    await page.screenshot({ path: shot('v6a-rest-bar') });
  });

  test('V6b active workout pill', async ({ page }) => {
    await seedStorage(page, {
      progress: partialW1D1(),
      session: { dayId: 'w1-d1', startedAt: Date.now() - 5 * 60_000 },
    });
    await page.goto('/week/1');
    await settle(page);
    await page.screenshot({ path: shot('v6b-pill') });
  });

  test('V6c conflict sheet', async ({ page }) => {
    await seedStorage(page, {
      session: { dayId: 'w1-d1', startedAt: Date.now() - 12 * 60_000 },
    });
    await page.goto('/workout/w1-d2');
    await settle(page, 1000);
    await page.screenshot({ path: shot('v6c-conflict-sheet') });
  });
});
