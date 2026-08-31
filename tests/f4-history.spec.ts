import { test, expect, type Page } from '@playwright/test';
import { seedStorage, squatHistory3Weeks } from './helpers/fixtures';

// F4 — exercise history + progression placeholders (docs/gauntlet/ANSWER_KEY.md).
// Fixture: squatHistory3Weeks() — Back Squat w1/w2/w3 day 1 fully completed at
// 80/85/90 kg × 6 (w1/w2 = 4 sets, w3 = 5 sets per MAIN_LIFT). Week 4 Day A
// (deload) prescribes Back Squat 3 × 5, so every w4 set index has a w3 prior.

/** The exercise section on the workout page whose heading matches `name`. */
function exerciseSection(page: Page, name: string | RegExp) {
  return page
    .locator('main section')
    .filter({ has: page.getByRole('heading', { name }) });
}

/** Open the per-exercise history bottom sheet by tapping the exercise name. */
async function openHistorySheet(page: Page, buttonName: RegExp, sheetTitle: string) {
  await page.getByRole('button', { name: buttonName }).click();
  const sheet = page.getByRole('dialog', { name: sheetTitle });
  await expect(sheet).toBeVisible();
  return sheet;
}

test.describe('F4 — exercise history + progression placeholders', () => {
  test('seed 3 weeks of Back Squat logs (80/85/90): on /workout/w4-d1 the Previous column and input placeholders show week-3 values', async ({
    page,
  }) => {
    await seedStorage(page, { progress: squatHistory3Weeks() });
    await page.goto('/workout/w4-d1');
    await expect(page.getByRole('heading', { name: /Back Squat/ })).toBeVisible();

    const squat = exerciseSection(page, /Back Squat/);

    // Previous column: every one of the 3 deload rows shows the week-3 log
    // (90 kg × 6) — the most recent prior completed — not week 1 or 2.
    await expect(squat.getByText('90kg × 6')).toHaveCount(3);
    await expect(squat.getByText('80kg × 6')).toHaveCount(0);
    await expect(squat.getByText('85kg × 6')).toHaveCount(0);

    // Input placeholders mirror the week-3 values for each set row.
    const weightInputs = squat.locator('input[inputmode="decimal"]');
    const repsInputs = squat.locator('input[inputmode="numeric"]');
    await expect(weightInputs).toHaveCount(3);
    for (let i = 0; i < 3; i++) {
      await expect(weightInputs.nth(i)).toHaveAttribute('placeholder', '90');
      await expect(repsInputs.nth(i)).toHaveAttribute('placeholder', '6');
    }
  });

  test('history sheet for Back Squat lists weeks 3,2,1 in that order with "{weight} kg × {reps}" rows and per-week prescription meta', async ({
    page,
  }) => {
    await seedStorage(page, { progress: squatHistory3Weeks() });
    await page.goto('/workout/w4-d1');
    await expect(page.getByRole('heading', { name: /Back Squat/ })).toBeVisible();

    const sheet = await openHistorySheet(page, /\d+\.\s*Back Squat/, 'Back Squat');

    // Weeks listed most recent first: 3, 2, 1.
    await expect(sheet.getByText(/^Week \d+$/)).toHaveText(['Week 3', 'Week 2', 'Week 1']);

    // Per-week set rows in "{weight} kg × {reps}" form, matching the seed
    // (w3 = 5 sets @ 90, w2 = 4 @ 85, w1 = 4 @ 80).
    await expect(sheet.getByText('90 kg × 6')).toHaveCount(5);
    await expect(sheet.getByText('85 kg × 6')).toHaveCount(4);
    await expect(sheet.getByText('80 kg × 6')).toHaveCount(4);

    // Per-week prescription meta (sets × reps @ load, straight from the plan).
    await expect(sheet.getByText('5 × 6 @ 75% TM')).toBeVisible();
    await expect(sheet.getByText('4 × 6 @ 72.5% TM')).toBeVisible();
    await expect(sheet.getByText('4 × 6 @ 70% TM')).toBeVisible();
  });

  test('chart appears (≥2 weighted weeks) and its "Heaviest set" callout names 90 kg, week 3', async ({
    page,
  }) => {
    await seedStorage(page, { progress: squatHistory3Weeks() });
    await page.goto('/workout/w4-d1');
    await expect(page.getByRole('heading', { name: /Back Squat/ })).toBeVisible();

    const sheet = await openHistorySheet(page, /\d+\.\s*Back Squat/, 'Back Squat');

    // Callout names 90 kg in week 3.
    const callout = sheet.getByText(/Heaviest set/);
    await expect(callout).toBeVisible();
    await expect(callout).toContainText('90 kg');
    await expect(callout).toContainText(/week 3/i);

    // The progression chart itself (SVG line + one point per weighted week) is rendered.
    const chartSvg = sheet.locator('svg', { has: page.locator('circle') });
    await expect(chartSvg).toBeVisible();
    await expect(chartSvg.locator('circle')).toHaveCount(3);
  });

  test('an exercise with no logs shows the empty-state copy, not a blank sheet', async ({
    page,
  }) => {
    // Only Back Squat has history; Hang Power Clean has none.
    await seedStorage(page, { progress: squatHistory3Weeks() });
    await page.goto('/workout/w4-d1');
    await expect(page.getByRole('heading', { name: /Hang Power Clean/ })).toBeVisible();

    const sheet = await openHistorySheet(page, /\d+\.\s*Hang Power Clean/, 'Hang Power Clean');

    await expect(sheet.getByText(/No sets logged yet/)).toBeVisible();
    // Not a blank sheet, and no phantom history content.
    await expect(sheet.getByText(/^Week \d+$/)).toHaveCount(0);
    await expect(sheet.getByText(/Heaviest set/)).toHaveCount(0);
  });

  test('week 1 (no priors) shows placeholder fallback — target reps, "—" for weight — and never crashes', async ({
    page,
  }) => {
    const errors: Error[] = [];
    page.on('pageerror', (e) => errors.push(e));

    // No seed at all: nothing prior to week 1 can exist.
    await page.goto('/workout/w1-d1');
    await expect(page.getByRole('heading', { name: /Back Squat/ })).toBeVisible();

    const squat = exerciseSection(page, /Back Squat/);

    // Previous column falls back to the em-dash for every row (4 sets in week 1).
    await expect(squat.getByText('—', { exact: true })).toHaveCount(4);

    // Weight placeholder falls back to "—"; reps placeholder falls back to the
    // prescribed target reps (6 for week-1 Back Squat).
    const weightInputs = squat.locator('input[inputmode="decimal"]');
    const repsInputs = squat.locator('input[inputmode="numeric"]');
    await expect(weightInputs).toHaveCount(4);
    for (let i = 0; i < 4; i++) {
      await expect(weightInputs.nth(i)).toHaveAttribute('placeholder', '—');
      await expect(repsInputs.nth(i)).toHaveAttribute('placeholder', '6');
    }

    // History sheet also survives the no-priors case (empty state, no crash).
    const sheet = await openHistorySheet(page, /\d+\.\s*Back Squat/, 'Back Squat');
    await expect(sheet.getByText(/No sets logged yet/)).toBeVisible();

    expect(errors).toEqual([]);
  });
});
