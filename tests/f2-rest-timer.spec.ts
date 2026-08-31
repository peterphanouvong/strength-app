import { test, expect, type Page } from '@playwright/test';
import { seedStorage, readStorage, REST_KEY } from './helpers/fixtures';

// F2 — rest timer lifecycle (docs/gauntlet/ANSWER_KEY.md).
// Day A (`/workout/w1-d1`) first exercise: Hang Power Clean, restSec 180 in src/data.ts.

const HPC = 'Hang Power Clean';
const HPC_REST_SEC = 180; // frozen prescription in src/data.ts

/** The floating rest countdown bar (never confusable with the ActiveWorkoutPill: only the
 *  rest bar carries the "Rest ·" label). */
function restBar(page: Page) {
  return page.locator('div.fixed.bottom-4').filter({ hasText: 'Rest ·' });
}

/** Displayed remaining time, parsed from the bar's m:ss countdown, in seconds. */
async function displayedRemaining(page: Page): Promise<number> {
  const text = await restBar(page).getByText(/^\d+:\d{2}$/).textContent();
  const [m, s] = (text ?? '').split(':').map(Number);
  return m * 60 + s;
}

/** Tick the first unticked set on the page (Hang Power Clean rows come first). */
async function tickFirstSet(page: Page) {
  await page.getByRole('button', { name: 'Mark set complete' }).first().click();
}

async function openWorkout(page: Page) {
  await page.goto('/workout/w1-d1');
  await expect(page.getByRole('heading', { name: new RegExp(HPC) })).toBeVisible();
}

test.describe('F2 — rest timer lifecycle', () => {
  test('ticking a set with restSec > 0 shows the rest bar with that exercise name and its configured duration', async ({
    page,
  }) => {
    await openWorkout(page);
    await expect(restBar(page)).toHaveCount(0);

    await tickFirstSet(page);

    const bar = restBar(page);
    await expect(bar).toBeVisible();
    await expect(bar).toContainText(`Rest · ${HPC}`);
    // Configured duration 3:00 — allow one tick of drift between click and read.
    const remaining = await displayedRemaining(page);
    expect(remaining).toBeGreaterThanOrEqual(HPC_REST_SEC - 1);
    expect(remaining).toBeLessThanOrEqual(HPC_REST_SEC);
  });

  test('+15s adds exactly 15s to the displayed remaining time (tolerance 1s)', async ({ page }) => {
    await openWorkout(page);
    await tickFirstSet(page);
    await expect(restBar(page)).toBeVisible();

    const before = await displayedRemaining(page);
    await restBar(page).getByRole('button', { name: '15s' }).click();

    // The countdown re-renders on its next tick (≤250ms); poll until the displayed
    // value reflects +15s within the 1s tolerance. A wrong delta (0, 30, …) never
    // enters the window and fails the poll.
    await expect
      .poll(
        async () => {
          const delta = (await displayedRemaining(page)) - before;
          return delta >= 14 && delta <= 16 ? 'delta within 15±1s' : `delta ${delta}s`;
        },
        { timeout: 2_000 }
      )
      .toBe('delta within 15±1s');
  });

  test('skip (X) dismisses the rest bar immediately', async ({ page }) => {
    await openWorkout(page);
    await tickFirstSet(page);
    await expect(restBar(page)).toBeVisible();

    await restBar(page).getByRole('button', { name: 'Skip rest' }).click();
    // Removed from the DOM once the exit animation completes.
    await expect(restBar(page)).toHaveCount(0, { timeout: 2_000 });
  });

  test('expiry: bar auto-dismisses when the countdown reaches 0 (short override seed)', async ({
    page,
  }) => {
    // Seed a 3-second override so the test observes a real expiry quickly.
    await seedStorage(page, { rest: { [HPC]: 3 } });
    await openWorkout(page);
    await tickFirstSet(page);

    await expect(restBar(page)).toBeVisible();
    await expect(restBar(page)).toHaveCount(0, { timeout: 8_000 });
  });

  test('un-ticking a set does NOT start a rest timer', async ({ page }) => {
    // Seed the first HPC set as already completed, then untick it.
    await seedStorage(page, {
      progress: { 'w1-d1-e1-0': { completed: true, weight: '60', actualReps: '3' } },
    });
    await openWorkout(page);

    await page.getByRole('button', { name: 'Mark set incomplete' }).first().click();
    // The row flipped back to incomplete…
    await expect(page.getByRole('button', { name: 'Mark set incomplete' })).toHaveCount(0);
    // …and no rest bar ever appears.
    await page.waitForTimeout(800);
    await expect(restBar(page)).toHaveCount(0);
  });

  test('changing rest duration in the sheet persists in vb-rest-overrides-v1 and is used for the next tick', async ({
    page,
  }) => {
    await openWorkout(page);

    // Open the rest sheet for Hang Power Clean (first exercise's rest chip).
    await page.getByRole('button', { name: /^Rest timer: 3:00/ }).first().click();
    const sheet = page.getByRole('dialog', { name: `Rest timer · ${HPC}` });
    await expect(sheet).toBeVisible();
    await sheet.getByRole('button', { name: '0:30', exact: true }).click();
    await expect(sheet).toHaveCount(0);

    // Persisted in the frozen key, exact shape Record<exerciseName, seconds>.
    const overrides = await readStorage<Record<string, number>>(page, REST_KEY);
    expect(overrides).toMatchObject({ [HPC]: 30 });

    // Used for the next tick: bar starts from 0:30, not 3:00.
    await tickFirstSet(page);
    await expect(restBar(page)).toContainText(`Rest · ${HPC}`);
    const remaining = await displayedRemaining(page);
    expect(remaining).toBeGreaterThanOrEqual(29);
    expect(remaining).toBeLessThanOrEqual(30);
  });

  test('"Off" (0) in the sheet persists and starts no timer on the next tick', async ({ page }) => {
    await openWorkout(page);

    await page.getByRole('button', { name: /^Rest timer: 3:00/ }).first().click();
    const sheet = page.getByRole('dialog', { name: `Rest timer · ${HPC}` });
    await expect(sheet).toBeVisible();
    await sheet.getByRole('button', { name: 'Off', exact: true }).click();
    await expect(sheet).toHaveCount(0);

    const overrides = await readStorage<Record<string, number>>(page, REST_KEY);
    expect(overrides).toMatchObject({ [HPC]: 0 });
    await expect(page.getByRole('button', { name: /^Rest timer: Off/ }).first()).toBeVisible();

    await tickFirstSet(page);
    await page.waitForTimeout(800);
    await expect(restBar(page)).toHaveCount(0);
  });
});
