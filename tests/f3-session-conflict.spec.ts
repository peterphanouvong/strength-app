import { test, expect, type Page } from '@playwright/test';
import { seedStorage, readStorage, partialW1D1, PROGRESS_KEY, SESSION_KEY, type SetLog } from './helpers/fixtures';

// F3 — session conflict (docs/gauntlet/ANSWER_KEY.md, re-aimed to the approved
// 2026-09-05 consumer-flows spec: browsing another day never raises the sheet —
// only attempting to START it does, and the sheet gains a third, destructive
// "Discard the other workout" action).
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

/** Tap the preview page's sticky Start CTA. */
async function tapStart(page: Page) {
  await page.getByRole('button', { name: 'Start workout' }).click();
}

test.describe('F3 — session conflict', () => {
  test('seeded w1-d1 session + open /workout/w1-d2 → browsing shows NO sheet; tapping Start raises it naming Day A ("Lower Strength"), its minutes and all three actions', async ({
    page,
  }) => {
    // Started 12 minutes ago (small pad so it still rounds to 12 by render time).
    const startedAt = Date.now() - (12 * 60_000 + 5_000);
    await seedStorage(page, { session: { dayId: 'w1-d1', startedAt } });
    await page.goto('/workout/w1-d2');

    // Browsing another day is free — no sheet on open.
    await expect(page.getByRole('heading', { name: 'Upper Push' })).toBeVisible();
    await expect(conflictSheet(page)).toHaveCount(0);

    await tapStart(page);
    const sheet = conflictSheet(page);
    await expect(sheet).toBeVisible();
    // Names the conflicting workout, Day A's title ("Lower Strength"), not this page's.
    await expect(sheet).toContainText('Lower Strength');
    // ...and how long it has been running.
    await expect(sheet).toContainText('12 min');
    // All three resolution actions offered.
    await expect(sheet.getByRole('button', { name: 'Go back to that workout' })).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'End it and start this one' })).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Discard the other workout' })).toBeVisible();
  });

  test('"Go back to that workout" → lands on /workout/w1-d1, session key unchanged', async ({
    page,
  }) => {
    const seeded: Session = { dayId: 'w1-d1', startedAt: Date.now() - 12 * 60_000 };
    await seedStorage(page, { session: seeded });
    await page.goto('/workout/w1-d2');
    await tapStart(page);
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
    await tapStart(page);
    await expect(conflictSheet(page)).toBeVisible();

    const before = Date.now();
    await page.getByRole('button', { name: 'End it and start this one' }).click();

    await expect(conflictSheet(page)).toBeHidden();
    await expect(page).toHaveURL(/\/workout\/w1-d2$/);
    // This day is now live.
    await expect(page.getByRole('button', { name: 'Finish' })).toBeVisible();

    const session = await readStorage<Session>(page, SESSION_KEY);
    expect(session?.dayId).toBe('w1-d2');
    // startedAt is fresh (take-over moment), not the old session's.
    expect(session!.startedAt).toBeGreaterThanOrEqual(before - 1_000);
    expect(session!.startedAt).toBeLessThanOrEqual(Date.now() + 1_000);

    // Timer runs from ~0 for the new workout.
    const shown = await durationSeconds(page);
    expect(shown).toBeLessThanOrEqual(5);
  });

  test('"Discard the other workout" → w1-d1\'s logged sets are cleared, unrelated entries survive, w1-d2 goes live on a fresh session', async ({
    page,
  }) => {
    await seedStorage(page, {
      // 4 seeded w1-d1 entries (3 completed) + one w2 entry proving day-scoping.
      progress: { ...partialW1D1(), 'w2-d1-e1-0': { completed: true, weight: '65' } as SetLog },
      session: { dayId: 'w1-d1', startedAt: Date.now() - 12 * 60_000 },
    });
    await page.goto('/workout/w1-d2');
    await tapStart(page);
    await expect(conflictSheet(page)).toBeVisible();

    const before = Date.now();
    await page.getByRole('button', { name: 'Discard the other workout' }).click();
    await expect(conflictSheet(page)).toBeHidden();

    // This day is live on a fresh session.
    const session = await readStorage<Session>(page, SESSION_KEY);
    expect(session?.dayId).toBe('w1-d2');
    expect(session!.startedAt).toBeGreaterThanOrEqual(before - 1_000);
    await expect(page.getByRole('button', { name: 'Finish' })).toBeVisible();

    // Every w1-d1 progress entry is gone; the unrelated w2 entry is untouched.
    const progress = await readStorage<Record<string, SetLog>>(page, PROGRESS_KEY);
    expect(Object.keys(progress ?? {}).filter((k) => k.startsWith('w1-d1-'))).toHaveLength(0);
    expect(progress?.['w2-d1-e1-0']).toEqual({ completed: true, weight: '65' });
  });

  test('same-day navigation (w1-d1 active → open w1-d1) resumes live with NO conflict sheet and keeps startedAt (timer resumes, not resets)', async ({
    page,
  }) => {
    const seeded: Session = { dayId: 'w1-d1', startedAt: Date.now() - 5 * 60_000 };
    await seedStorage(page, { session: seeded });
    await page.goto('/workout/w1-d1');

    // Page is up (sticky header title for Day A), live (no Start CTA) and no
    // conflict sheet ever blocks it.
    await expect(page.getByRole('heading', { name: 'Lower Strength' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Finish' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start workout' })).toHaveCount(0);
    await expect(conflictSheet(page)).toHaveCount(0);

    // startedAt untouched — the session was resumed, not restarted.
    const session = await readStorage<Session>(page, SESSION_KEY);
    expect(session).toEqual(seeded);

    // Elapsed timer continues from the original start (~5 min), not from 0.
    await expect.poll(() => durationSeconds(page)).toBeGreaterThanOrEqual(5 * 60);
  });
});
