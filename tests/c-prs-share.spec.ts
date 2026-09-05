import { test, expect, type Page, type Locator } from '@playwright/test';
import {
  seedStorage,
  readStorage,
  canonicalW1D1,
  squatHistory3Weeks,
  completedWorkout,
  seededSquatBest,
  seededKneeRaiseBest,
  seededBests,
  BESTS_KEY,
  type PersonalBest,
} from './helpers/fixtures';

// C — PR badges + share preview
// (docs/superpowers/specs/2026-09-05-consumer-flows-design.md, phase C).

type BestsMap = Record<string, PersonalBest>;

/** Rest overrides = 0 so no rest bar overlays the rows mid-flow. */
const NO_REST = {
  'Hang Power Clean': 0,
  'Back Squat': 0,
  'Bulgarian Split Squat': 0,
  'Hanging Knee Raise': 0,
  Sprints: 0,
};

function exerciseSection(page: Page, name: string) {
  return page
    .locator('main section')
    .filter({ has: page.getByRole('heading', { name: new RegExp(name) }) });
}

function badge(scope: Page | Locator) {
  return scope.getByRole('img', { name: 'New best' });
}

/** Open w1-d1 live (session seeded, rest off) with optional seeded bests. */
async function openLiveW1D1(page: Page, bests?: BestsMap) {
  await seedStorage(page, {
    session: { dayId: 'w1-d1', startedAt: Date.now() - 5 * 60_000 },
    rest: NO_REST,
    bests,
  });
  await page.goto('/workout/w1-d1');
  await expect(page.getByRole('button', { name: 'Finish' })).toBeVisible();
}

/** Fill one set row of an exercise (weight/reps/time as applicable), then tick it. */
async function logSet(
  page: Page,
  name: string,
  setIndex: number,
  values: { weight?: string; reps?: string; time?: string }
) {
  const section = exerciseSection(page, name);
  if (values.weight !== undefined)
    await section.locator('input[inputmode="decimal"]').nth(setIndex).fill(values.weight);
  if (values.reps !== undefined)
    await section.locator('input[inputmode="numeric"]').nth(setIndex).fill(values.reps);
  if (values.time !== undefined)
    await section.locator('input[inputmode="decimal"]').nth(setIndex).fill(values.time);
  // Ticking flips the row's label to "Mark set incomplete", so .first() is always the next row.
  await section.getByRole('button', { name: 'Mark set complete' }).first().click();
}

test.describe('C — PR badges (live mode)', () => {
  test('beating the seeded best weight badges the row and stores the new best immediately; un-tick does not revoke', async ({
    page,
  }) => {
    await openLiveW1D1(page, seededSquatBest(90, 6));
    await logSet(page, 'Back Squat', 0, { weight: '92.5', reps: '5' });

    const squat = exerciseSection(page, 'Back Squat');
    await expect(badge(squat)).toHaveCount(1);

    // Stored immediately, before any Finish/Save.
    let bests = await readStorage<BestsMap>(page, BESTS_KEY);
    expect(bests?.['Back Squat']?.bestWeight).toMatchObject({
      weight: 92.5,
      reps: 5,
      dayId: 'w1-d1',
    });

    // Un-ticking the set does not revoke the stored best.
    await squat.getByRole('button', { name: 'Mark set incomplete' }).click();
    await expect(squat.getByRole('button', { name: 'Mark set incomplete' })).toHaveCount(0);
    bests = await readStorage<BestsMap>(page, BESTS_KEY);
    expect(bests?.['Back Squat']?.bestWeight).toMatchObject({ weight: 92.5, reps: 5 });
  });

  test('equal or lower weight never badges and leaves the stored best untouched', async ({
    page,
  }) => {
    await openLiveW1D1(page, seededSquatBest(90, 6));
    await logSet(page, 'Back Squat', 0, { weight: '90', reps: '6' }); // equal weight, equal reps
    await logSet(page, 'Back Squat', 1, { weight: '85', reps: '8' }); // lower weight

    const squat = exerciseSection(page, 'Back Squat');
    await expect(squat.getByRole('button', { name: 'Mark set incomplete' })).toHaveCount(2);
    await expect(badge(page)).toHaveCount(0);

    const bests = await readStorage<BestsMap>(page, BESTS_KEY);
    expect(bests?.['Back Squat']?.bestWeight).toMatchObject({
      weight: 90,
      reps: 6,
      dayId: 'w3-d1',
    });
  });

  test('the same weight for more reps is a new best (reps tie-break)', async ({ page }) => {
    await openLiveW1D1(page, seededSquatBest(90, 6));
    await logSet(page, 'Back Squat', 0, { weight: '90', reps: '8' });

    await expect(badge(exerciseSection(page, 'Back Squat'))).toHaveCount(1);
    const bests = await readStorage<BestsMap>(page, BESTS_KEY);
    expect(bests?.['Back Squat']?.bestWeight).toMatchObject({ weight: 90, reps: 8, dayId: 'w1-d1' });
  });

  test('reps-tracked exercises badge on more reps than the seeded best', async ({ page }) => {
    await openLiveW1D1(page, seededKneeRaiseBest(12));
    await logSet(page, 'Hanging Knee Raise', 0, { reps: '13' });

    await expect(badge(exerciseSection(page, 'Hanging Knee Raise'))).toHaveCount(1);
    const bests = await readStorage<BestsMap>(page, BESTS_KEY);
    expect(bests?.['Hanging Knee Raise']?.bestReps).toMatchObject({ reps: 13, dayId: 'w1-d1' });
    expect(bests?.['Hanging Knee Raise']?.bestWeight).toBeUndefined();
  });

  test('time-tracked exercises never badge and never enter the bests map', async ({ page }) => {
    await seedStorage(page, {
      session: { dayId: 'w1-d3', startedAt: Date.now() - 5 * 60_000 },
      rest: NO_REST,
    });
    await page.goto('/workout/w1-d3');
    await expect(page.getByRole('button', { name: 'Finish' })).toBeVisible();

    await logSet(page, 'Sprints', 0, { time: '3.4' });
    await expect(
      exerciseSection(page, 'Sprints').getByRole('button', { name: 'Mark set incomplete' })
    ).toHaveCount(1);
    await expect(badge(page)).toHaveCount(0);

    const bests = await readStorage<BestsMap>(page, BESTS_KEY);
    expect(bests?.['Sprints']).toBeUndefined();
  });

  test('bests bootstrap lazily from the existing progress map on first read — and surface on Home', async ({
    page,
  }) => {
    // 3 weeks of squat history (top: 90 kg × 6 in w3-d1) and no bests key at all.
    await seedStorage(page, { progress: squatHistory3Weeks() });
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: /Good (morning|afternoon|evening)/ })
    ).toBeVisible();

    const bests = await readStorage<BestsMap>(page, BESTS_KEY);
    expect(bests?.['Back Squat']?.bestWeight).toMatchObject({
      weight: 90,
      reps: 6,
      dayId: 'w3-d1',
    });

    const list = page.getByRole('list', { name: 'Recent PRs' });
    await expect(list.getByRole('listitem')).toHaveCount(1);
    await expect(list.getByRole('listitem').first()).toContainText('Back Squat');
    await expect(list.getByRole('listitem').first()).toContainText('90 kg × 6');
  });

  test("Save reconciles PRs from the workout's logged sets (source of truth)", async ({ page }) => {
    await seedStorage(page, {
      progress: canonicalW1D1(),
      session: { dayId: 'w1-d1', startedAt: Date.now() - 40 * 60_000 },
      bests: seededSquatBest(70, 6), // below the workout's 80 kg squats
    });
    await page.goto('/workout/w1-d1');
    await page.getByRole('button', { name: 'Finish' }).click();
    await page.getByRole('button', { name: 'Save workout' }).click();
    await expect(page).toHaveURL(/\/congrats\/w1-d1$/);

    const bests = await readStorage<BestsMap>(page, BESTS_KEY);
    expect(bests?.['Back Squat']?.bestWeight).toMatchObject({ weight: 80, reps: 6, dayId: 'w1-d1' });
    expect(bests?.['Hang Power Clean']?.bestWeight).toMatchObject({ weight: 60, reps: 3 });
    expect(bests?.['Bulgarian Split Squat']?.bestWeight).toMatchObject({ weight: 20, reps: 8 });
    expect(bests?.['Hanging Knee Raise']?.bestReps).toMatchObject({ reps: 10 });
    expect(bests?.['Sprints']).toBeUndefined();
  });
});

test.describe('C — recent PRs on Home, full list on Profile', () => {
  test('home shows up to 3 recent PRs, most recent first', async ({ page }) => {
    await seedStorage(page, { bests: seededBests() });
    await page.goto('/');

    const list = page.getByRole('list', { name: 'Recent PRs' });
    await expect(list.getByRole('listitem')).toHaveCount(3);
    await expect(list.getByRole('listitem').nth(0)).toContainText('Back Squat');
    await expect(list.getByRole('listitem').nth(0)).toContainText('90 kg × 6');
    await expect(list.getByRole('listitem').nth(1)).toContainText('Bench Press');
    await expect(list.getByRole('listitem').nth(2)).toContainText('Pull-Ups');
    await expect(list.getByRole('listitem').nth(2)).toContainText('12 reps');
    await expect(list).not.toContainText('Hang Power Clean'); // 4th, oldest — cut
  });

  test('profile lists every personal best', async ({ page }) => {
    await seedStorage(page, { bests: seededBests() });
    await page.goto('/profile');

    const list = page.getByRole('list', { name: 'Personal bests' });
    await expect(list.getByRole('listitem')).toHaveCount(4);
    await expect(list).toContainText('Hang Power Clean');
    await expect(list).toContainText('62.5 kg × 3');
    await expect(list).toContainText('Pull-Ups');
    await expect(list).toContainText('12 reps');
  });
});

test.describe('C — share preview', () => {
  test('Share opens a preview sheet first — nothing is shared until the user confirms', async ({
    page,
  }) => {
    await seedStorage(page, { history: [completedWorkout(0)] });
    await page.addInitScript(() => {
      (window as unknown as { __shareCalls: number }).__shareCalls = 0;
      Object.defineProperty(navigator, 'canShare', { value: () => true, configurable: true });
      Object.defineProperty(navigator, 'share', {
        value: () => {
          (window as unknown as { __shareCalls: number }).__shareCalls += 1;
          return Promise.resolve();
        },
        configurable: true,
      });
    });
    await page.goto('/congrats/w1-d1');

    await page.getByRole('button', { name: 'Share', exact: true }).click();
    const sheet = page.getByRole('dialog', { name: 'Share workout' });
    await expect(sheet).toBeVisible();
    await expect(sheet.getByAltText('Share card preview')).toBeVisible();

    // The preview alone shared nothing.
    expect(
      await page.evaluate(() => (window as unknown as { __shareCalls: number }).__shareCalls)
    ).toBe(0);

    // Confirming shares exactly once, then the sheet closes.
    await sheet.getByRole('button', { name: 'Share', exact: true }).click();
    await expect
      .poll(() =>
        page.evaluate(() => (window as unknown as { __shareCalls: number }).__shareCalls)
      )
      .toBe(1);
    await expect(sheet).toHaveCount(0);
  });

  test('Close dismisses without sharing; Save image downloads; sheet Share falls back to download without navigator.share', async ({
    page,
  }) => {
    await seedStorage(page, { history: [completedWorkout(0)] });
    await page.addInitScript(() => {
      Object.defineProperty(navigator, 'share', { value: undefined, configurable: true });
      Object.defineProperty(navigator, 'canShare', { value: undefined, configurable: true });
    });
    await page.goto('/congrats/w1-d1');

    const sheet = page.getByRole('dialog', { name: 'Share workout' });

    // Close leaves the sheet without any share or download.
    await page.getByRole('button', { name: 'Share', exact: true }).click();
    await expect(sheet).toBeVisible();
    await sheet.getByRole('button', { name: 'Close' }).click();
    await expect(sheet).toHaveCount(0);
    await expect(page).toHaveURL(/\/congrats\/w1-d1$/);

    // Save image downloads the card (same filename convention as before).
    await page.getByRole('button', { name: 'Share', exact: true }).click();
    await expect(sheet).toBeVisible();
    const downloadFromSave = page.waitForEvent('download');
    await sheet.getByRole('button', { name: 'Save image' }).click();
    expect((await downloadFromSave).suggestedFilename()).toBe('workout-week1.png');
    await expect(sheet).toHaveCount(0);

    // With navigator.share unavailable, the sheet's Share falls back to a download.
    await page.getByRole('button', { name: 'Share', exact: true }).click();
    await expect(sheet).toBeVisible();
    const downloadFromShare = page.waitForEvent('download');
    await sheet.getByRole('button', { name: 'Share', exact: true }).click();
    expect((await downloadFromShare).suggestedFilename()).toBe('workout-week1.png');
  });
});
