import { test, expect, type Page } from '@playwright/test';
import { readStorage, seedStorage, SESSION_KEY } from './helpers/fixtures';

// Q1 — invalid /workout/:id must not start a phantom session (docs/gauntlet/ANSWER_KEY.md Q1).
// Pre-fix, useSessionTimer ran before the !day guard and wrote vb-active-session-v1
// with the bogus dayId, then blocked every real workout with the conflict sheet.

type Session = { dayId: string; startedAt: number };

function conflictSheet(page: Page) {
  return page.getByRole('dialog', { name: 'Workout in progress' });
}

test.describe('Q1 — invalid workout id does not start a phantom session', () => {
  test('visiting /workout/<bogus> with clean storage writes no session key', async ({ page }) => {
    await page.goto('/workout/nope-not-a-day');

    await expect(page.getByText('Workout not found.')).toBeVisible();

    // Give any stray effect a moment to (wrongly) write the key, then assert it never did.
    await page.waitForTimeout(1_500);
    const session = await readStorage<Session>(page, SESSION_KEY);
    expect(session).toBeNull();
  });

  test('after visiting a bogus id, a real workout opens with no conflict sheet and starts its own session', async ({
    page,
  }) => {
    await page.goto('/workout/nope-not-a-day');
    await expect(page.getByText('Workout not found.')).toBeVisible();

    await page.goto('/workout/w1-d1');

    // The real workout renders unblocked — no "Workout in progress" sheet.
    await expect(page.getByRole('heading', { name: 'Lower Strength' })).toBeVisible();
    await expect(conflictSheet(page)).toHaveCount(0);

    // The session now running belongs to the real day, never the bogus id.
    await expect
      .poll(async () => (await readStorage<Session>(page, SESSION_KEY))?.dayId)
      .toBe('w1-d1');
  });
});

// Q1 — BottomSheet backdrop must not stay clickable during its exit animation.
// Pre-fix, AnimatePresence kept the full-screen backdrop button mounted and
// interactive for the ~300ms exit, so an impatient second tap right after
// "End it and start this one" fired the conflict sheet's onClose
// (navigate(/week/N)) and yanked the user off the workout they just took over.

test.describe('Q1 — closing bottom sheet is not clickable mid-exit', () => {
  test('rapid tap ~100ms after "End it and start this one" does not navigate away from the taken-over workout', async ({
    page,
  }) => {
    await seedStorage(page, { session: { dayId: 'w1-d1', startedAt: Date.now() - 12 * 60_000 } });
    await page.goto('/workout/w1-d2');

    const sheet = page.getByRole('dialog', { name: 'Workout in progress' });
    await expect(sheet).toBeVisible();

    await page.getByRole('button', { name: 'End it and start this one' }).click();
    // Impatient second tap mid-screen while the sheet is still animating out.
    await page.waitForTimeout(100);
    await page.mouse.click(195, 300);

    // Let the exit animation (and any wrongly-triggered navigation) settle.
    await page.waitForTimeout(500);
    await expect(page).toHaveURL(/\/workout\/w1-d2$/);
    await expect(sheet).toBeHidden();

    // The takeover stuck: the session belongs to w1-d2.
    const session = await readStorage<Session>(page, SESSION_KEY);
    expect(session?.dayId).toBe('w1-d2');
  });
});
