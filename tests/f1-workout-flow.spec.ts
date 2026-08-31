import { test, expect, type Page } from '@playwright/test';
import { seedStorage, readStorage, PROGRESS_KEY, SESSION_KEY, type SetLog } from './helpers/fixtures';

// F1 — full workout flow (docs/gauntlet/ANSWER_KEY.md).
// Canonical fixture arithmetic: HPC 5×60×3 + Squat 4×80×6 + BSS 3×20×8 + HKR 3×10 reps
// → 15/15 sets, 3,300 kg volume.

/** Rest overrides = 0 for every Day A exercise so no rest bar overlays the rows mid-flow. */
const NO_REST = {
  'Hang Power Clean': 0,
  'Back Squat': 0,
  'Bulgarian Split Squat': 0,
  'Hanging Knee Raise': 0,
};

/** Seeded ~8 minutes ago; same-day open resumes the session so Duration is a plausible mm:ss. */
const SEEDED_ELAPSED_MS = 8 * 60_000;

/** Fill weight/reps then tick every set of one exercise, top to bottom. */
async function logExercise(
  page: Page,
  name: string,
  opts: { sets: number; weight?: string; reps: string }
) {
  const section = page
    .locator('main section')
    .filter({ has: page.getByRole('heading', { name: new RegExp(name) }) });
  for (let i = 0; i < opts.sets; i++) {
    if (opts.weight !== undefined) {
      await section.locator('input[inputmode="decimal"]').nth(i).fill(opts.weight);
    }
    await section.locator('input[inputmode="numeric"]').nth(i).fill(opts.reps);
    // Ticking flips this row's label to "Mark set incomplete", so .first() is always the next row.
    await section.getByRole('button', { name: 'Mark set complete' }).first().click();
  }
}

/** Bullet 1: start at /week/1, open Day A, tick every set of all 4 exercises entering
 *  the canonical weights, tap Finish. */
async function runFullWorkoutFlow(page: Page) {
  await seedStorage(page, {
    session: { dayId: 'w1-d1', startedAt: Date.now() - SEEDED_ELAPSED_MS },
    rest: NO_REST,
  });
  await page.goto('/week/1');
  await expect(page.getByRole('heading', { name: 'Week 1' })).toBeVisible();

  await page.getByRole('link', { name: /Lower Strength/ }).click();
  await expect(page).toHaveURL(/\/workout\/w1-d1$/);
  await expect(page.getByRole('heading', { name: /Hang Power Clean/ })).toBeVisible();

  await logExercise(page, 'Hang Power Clean', { sets: 5, weight: '60', reps: '3' });
  await logExercise(page, 'Back Squat', { sets: 4, weight: '80', reps: '6' });
  await logExercise(page, 'Bulgarian Split Squat', { sets: 3, weight: '20', reps: '8' });
  await logExercise(page, 'Hanging Knee Raise', { sets: 3, reps: '10' }); // reps-tracked, adds 0 kg

  await page.getByRole('button', { name: 'Finish' }).click();
}

/** The completion screen's stat value that sits under a given label. */
function statValue(page: Page, label: string) {
  return page.getByText(label, { exact: true }).locator('xpath=following-sibling::p[1]');
}

test.describe('F1 — full workout flow', () => {
  test('start at /week/1, open Day A, tick every set of all 4 exercises with canonical weights, Finish → lands on /complete/w1-d1 with Sets 15/15, Volume 3,300 kg, plausible duration', async ({
    page,
  }) => {
    await runFullWorkoutFlow(page);

    // Lands on /complete/w1-d1
    await expect(page).toHaveURL(/\/complete\/w1-d1$/);

    // Sets 15/15
    await expect(statValue(page, 'Sets')).toHaveText('15/15');

    // Volume 3,300 kg
    await expect(statValue(page, 'Volume')).toHaveText(/^3,300\s*kg$/);

    // Duration: plausible mm:ss — not 0:00 frozen, not NaN. Session was seeded ~8 min ago.
    const duration = (await statValue(page, 'Duration').innerText()).trim();
    expect(duration).not.toContain('NaN');
    expect(duration).toMatch(/^\d+:\d{2}$/);
    expect(duration).not.toBe('0:00');
    const [m] = duration.split(':').map(Number);
    expect(m).toBeGreaterThanOrEqual(7); // seeded 8 min ago, allow slack
    expect(m).toBeLessThanOrEqual(10);
  });

  test('after Finish: vb-active-session-v1 is removed and progress key contains 15 entries with completed: true', async ({
    page,
  }) => {
    await runFullWorkoutFlow(page);
    await expect(page).toHaveURL(/\/complete\/w1-d1$/);

    // Session key removed
    const session = await readStorage(page, SESSION_KEY);
    expect(session).toBeNull();

    // Progress key: exactly the 15 canonical entries, all completed: true
    const progress = await readStorage<Record<string, SetLog>>(page, PROGRESS_KEY);
    expect(progress).not.toBeNull();
    const entries = Object.entries(progress!);
    expect(entries).toHaveLength(15);
    for (const [key, log] of entries) {
      expect(key).toMatch(/^w1-d1-e[1-4]-\d+$/);
      expect(log.completed).toBe(true);
    }
    // Spot-check the logged values round-tripped in the frozen shape
    expect(progress!['w1-d1-e1-0']).toMatchObject({ completed: true, weight: '60', actualReps: '3' });
    expect(progress!['w1-d1-e2-3']).toMatchObject({ completed: true, weight: '80', actualReps: '6' });
    expect(progress!['w1-d1-e4-2']).toMatchObject({ completed: true, actualReps: '10' });
  });

  test('finishing with 0 sets ticked navigates back to the week — no completion screen, no session left behind', async ({
    page,
  }) => {
    await page.goto('/workout/w1-d1');
    await expect(page.getByRole('heading', { name: /Hang Power Clean/ })).toBeVisible();

    await page.getByRole('button', { name: 'Finish' }).click();

    // Back on the week, not the completion screen
    await expect(page).toHaveURL(/\/week\/1$/);
    await expect(page.getByRole('heading', { name: 'Week 1' })).toBeVisible();
    expect(page.url()).not.toContain('/complete/');

    // No session left behind
    const session = await readStorage(page, SESSION_KEY);
    expect(session).toBeNull();
  });
});
