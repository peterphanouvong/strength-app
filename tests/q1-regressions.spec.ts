import { test, expect, type Page } from '@playwright/test';
import { readStorage, SESSION_KEY } from './helpers/fixtures';

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
