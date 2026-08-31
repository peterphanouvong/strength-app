import { test, expect, type Page } from '@playwright/test';
import { seedStorage, readStorage, SESSION_KEY } from './helpers/fixtures';

// F3 — session conflict (docs/gauntlet/ANSWER_KEY.md).
// Day A = w1-d1 ("Day A: Lower Strength"), Day B = w1-d2 ("Day B: Upper Push") in src/data.ts.

type Session = { dayId: string; startedAt: number };

/** The conflict bottom sheet (BottomSheet renders role=dialog aria-label'd by its title). */
function conflictSheet(page: Page) {
  return page.getByRole('dialog', { name: 'Workout in progress' });
}

/** The Duration stat value (label <p> followed by the value <p>), e.g. "12:04". */
function durationStat(page: Page) {
  return page.locator('p:text-is("Duration") + p');
}

async function durationSeconds(page: Page): Promise<number> {
  const text = (await durationStat(page).textContent()) ?? '';
  const match = text.match(/^(\d+):(\d{2})$/);
  expect(match, `Duration stat should read m:ss, got "${text}"`).not.toBeNull();
  return Number(match![1]) * 60 + Number(match![2]);
}

test.describe('F3 — session conflict', () => {
  test('seeded w1-d1 session + navigate to /workout/w1-d2 → conflict sheet names Day A ("Lower Strength") and its running minutes', async ({
    page,
  }) => {
    // Started 12 minutes ago (small pad so it still rounds to 12 by render time).
    const startedAt = Date.now() - (12 * 60_000 + 5_000);
    await seedStorage(page, { session: { dayId: 'w1-d1', startedAt } });
    await page.goto('/workout/w1-d2');

    const sheet = conflictSheet(page);
    await expect(sheet).toBeVisible();
    // Names the conflicting workout, Day A's title ("Lower Strength"), not this page's.
    await expect(sheet).toContainText('Lower Strength');
    // ...and how long it has been running.
    await expect(sheet).toContainText('12 min');
    // Both resolution actions offered.
    await expect(sheet.getByRole('button', { name: 'Go back to that workout' })).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'End it and start this one' })).toBeVisible();
  });

  test('"Go back to that workout" → lands on /workout/w1-d1, session key unchanged', async ({
    page,
  }) => {
    const seeded: Session = { dayId: 'w1-d1', startedAt: Date.now() - 12 * 60_000 };
    await seedStorage(page, { session: seeded });
    await page.goto('/workout/w1-d2');
    await expect(conflictSheet(page)).toBeVisible();

    await page.getByRole('button', { name: 'Go back to that workout' }).click();

    await expect(page).toHaveURL(/\/workout\/w1-d1$/);
    // Now on the session's own day → no conflict sheet lingers.
    await expect(conflictSheet(page)).toBeHidden();

    // Session key byte-identical: same dayId, same startedAt (not restarted).
    const session = await readStorage<Session>(page, SESSION_KEY);
    expect(session).toEqual(seeded);

    // And the timer resumes from the original startedAt (~12 min, not 0).
    await expect.poll(() => durationSeconds(page)).toBeGreaterThanOrEqual(12 * 60);
  });

  test('"End it and start this one" → sheet closes, session key now dayId w1-d2, timer runs from ~0', async ({
    page,
  }) => {
    await seedStorage(page, { session: { dayId: 'w1-d1', startedAt: Date.now() - 12 * 60_000 } });
    await page.goto('/workout/w1-d2');
    await expect(conflictSheet(page)).toBeVisible();

    const before = Date.now();
    await page.getByRole('button', { name: 'End it and start this one' }).click();

    await expect(conflictSheet(page)).toBeHidden();
    await expect(page).toHaveURL(/\/workout\/w1-d2$/);

    const session = await readStorage<Session>(page, SESSION_KEY);
    expect(session?.dayId).toBe('w1-d2');
    // startedAt is fresh (take-over moment), not the old session's.
    expect(session!.startedAt).toBeGreaterThanOrEqual(before - 1_000);
    expect(session!.startedAt).toBeLessThanOrEqual(Date.now() + 1_000);

    // Timer runs from ~0 for the new workout.
    const shown = await durationSeconds(page);
    expect(shown).toBeLessThanOrEqual(5);
  });

  test('same-day navigation (w1-d1 active → open w1-d1) shows NO conflict sheet and keeps startedAt (timer resumes, not resets)', async ({
    page,
  }) => {
    const seeded: Session = { dayId: 'w1-d1', startedAt: Date.now() - 5 * 60_000 };
    await seedStorage(page, { session: seeded });
    await page.goto('/workout/w1-d1');

    // Page is up (sticky header title for Day A) and no conflict sheet ever blocks it.
    await expect(page.getByRole('heading', { name: 'Lower Strength' })).toBeVisible();
    await expect(conflictSheet(page)).toHaveCount(0);

    // startedAt untouched — the session was resumed, not restarted.
    const session = await readStorage<Session>(page, SESSION_KEY);
    expect(session).toEqual(seeded);

    // Elapsed timer continues from the original start (~5 min), not from 0.
    await expect.poll(() => durationSeconds(page)).toBeGreaterThanOrEqual(5 * 60);
  });
});
