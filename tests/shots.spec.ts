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
    await page.goto('/programme');
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

  test('V4 completion (save screen)', async ({ page }) => {
    // Seed an aged session so the save screen shows a real duration, matching
    // how the app behaves for a genuine workout (the flow reads elapsed from the
    // session's startedAt). Without this the stat card headlines a misleading 0:00.
    await seedStorage(page, {
      progress: canonicalW1D1(),
      session: { dayId: 'w1-d1', startedAt: Date.now() - 47 * 60_000 },
    });
    await page.goto('/workout/w1-d1');
    await settle(page);
    await page.getByRole('button', { name: 'Finish' }).click();
    await expect(page).toHaveURL(/\/complete\/w1-d1/);
    await expect(page.getByRole('heading', { name: 'Save workout' })).toBeVisible();
    await settle(page, 1200);
    await page.screenshot({ path: shot('v4-completion') });
  });

  test('V10 congrats (Finish → Save → congrats)', async ({ page }) => {
    await seedStorage(page, {
      progress: canonicalW1D1(),
      session: { dayId: 'w1-d1', startedAt: Date.now() - 47 * 60_000 },
    });
    await page.goto('/workout/w1-d1');
    await settle(page);
    await page.getByRole('button', { name: 'Finish' }).click();
    await expect(page).toHaveURL(/\/complete\/w1-d1/);
    await page.getByRole('button', { name: 'Save workout' }).click();
    await expect(page).toHaveURL(/\/congrats\/w1-d1/);
    await settle(page, 1200);
    await page.screenshot({ path: shot('v10-congrats') });
  });

  test('V5a set type sheet', async ({ page }) => {
    // Live session: set-type editing is disabled in browse-first preview mode.
    await seedStorage(page, {
      progress: partialW1D1(),
      session: { dayId: 'w1-d1', startedAt: Date.now() - 8 * 60_000 },
    });
    await page.goto('/workout/w1-d1');
    await settle(page);
    await page.getByRole('button', { name: 'Change set type' }).first().click();
    await settle(page, 600);
    await page.screenshot({ path: shot('v5a-set-type-sheet') });
  });

  test('V5b rest config sheet', async ({ page }) => {
    // Live session: rest editing is disabled in browse-first preview mode.
    await seedStorage(page, {
      progress: partialW1D1(),
      session: { dayId: 'w1-d1', startedAt: Date.now() - 8 * 60_000 },
    });
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

  // Entrance sequences: a mid-spring frame plus the settled frame, so critics can
  // verify the offscreen→rest motion from stills (motion is JS-driven; the mid frame
  // catches the element in flight below its rest position).
  test('V6d rest bar entrance sequence', async ({ page }) => {
    await seedStorage(page, {});
    await page.goto('/workout/w1-d1');
    await settle(page);
    await page.getByRole('button', { name: 'Mark set complete' }).first().click();
    await page.waitForTimeout(70);
    await page.screenshot({ path: shot('v6d-rest-bar-entrance-mid') });
    await settle(page, 700);
    await page.screenshot({ path: shot('v6d-rest-bar-entrance-settled') });
  });

  test('V6e pill entrance sequence', async ({ page }) => {
    await seedStorage(page, {
      session: { dayId: 'w1-d1', startedAt: Date.now() - 5 * 60_000 },
    });
    await page.goto('/');
    await page.waitForTimeout(120);
    await page.screenshot({ path: shot('v6e-pill-entrance-mid') });
    await settle(page, 800);
    await page.screenshot({ path: shot('v6e-pill-entrance-settled') });
  });

  test('V6f rest bar exit sequence', async ({ page }) => {
    await seedStorage(page, {});
    await page.goto('/workout/w1-d1');
    await settle(page);
    await page.getByRole('button', { name: 'Mark set complete' }).first().click();
    await settle(page, 700);
    await page.getByRole('button', { name: 'Skip rest' }).click();
    await page.waitForTimeout(80);
    await page.screenshot({ path: shot('v6f-rest-bar-exit-mid') });
  });

  test('V6c conflict sheet', async ({ page }) => {
    await seedStorage(page, {
      session: { dayId: 'w1-d1', startedAt: Date.now() - 12 * 60_000 },
    });
    // Conflicts moved to the Start action: browsing never raises the sheet.
    await page.goto('/workout/w1-d2');
    await settle(page);
    await page.getByRole('button', { name: 'Start workout' }).click();
    await settle(page, 1000);
    await page.screenshot({ path: shot('v6c-conflict-sheet') });
  });

  test('V7 home dashboard', async ({ page }) => {
    await seedStorage(page, {
      progress: partialW1D1(),
      session: { dayId: 'w1-d1', startedAt: Date.now() - 8 * 60_000 },
    });
    await page.goto('/');
    await settle(page);
    await page.screenshot({ path: shot('v7-home') });
  });

  test('V8 profile', async ({ page }) => {
    await page.goto('/profile');
    await settle(page);
    await page.screenshot({ path: shot('v8-profile') });
  });

  test('V9 workout preview (browse-first, no session)', async ({ page }) => {
    await seedStorage(page, { progress: partialW1D1() });
    await page.goto('/workout/w1-d1');
    await settle(page);
    await page.screenshot({ path: shot('v9-workout-preview') });
  });
});
