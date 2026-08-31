import { test, expect, type Page } from '@playwright/test';
import { readStorage, seedStorage, PROGRESS_KEY, SESSION_KEY, type SetLog } from './helpers/fixtures';

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

// Q1 — multi-tab clobber: useLocalStorage must not rewrite the whole progress map
// from the stale in-memory snapshot captured at mount. Pre-fix, a second tab's
// first tick ran its functional updater against the empty map it mounted with and
// setItem()'d the result, erasing every set the first tab had already logged.

test.describe('Q1 — second tab does not clobber first tab’s logged sets', () => {
  test('tab B ticking Back Squat set 1 keeps tab A’s Hang Power Clean set 1 (weight included) in storage and after reload', async ({
    page,
    context,
  }) => {
    const exerciseSection = (p: Page, name: string) =>
      p.locator('main section').filter({ has: p.getByRole('heading', { name: new RegExp(name) }) });

    // Both tabs open on the same workout before either writes anything.
    const tabA = page;
    await tabA.goto('/workout/w1-d1');
    await expect(tabA.getByRole('heading', { name: /Hang Power Clean/ })).toBeVisible();

    const tabB = await context.newPage();
    await tabB.goto('/workout/w1-d1');
    await expect(tabB.getByRole('heading', { name: /Hang Power Clean/ })).toBeVisible();

    // Tab A: 60 kg on Hang Power Clean set 1, then tick it.
    const hpcA = exerciseSection(tabA, 'Hang Power Clean');
    await hpcA.locator('input[inputmode="decimal"]').first().fill('60');
    await hpcA.getByRole('button', { name: 'Mark set complete' }).first().click();
    await expect
      .poll(async () => (await readStorage<Record<string, SetLog>>(tabA, PROGRESS_KEY))?.['w1-d1-e1-0']?.completed)
      .toBe(true);

    // Tab B (mounted before tab A's write): tick Back Squat set 1.
    await exerciseSection(tabB, 'Back Squat').getByRole('button', { name: 'Mark set complete' }).first().click();
    await expect
      .poll(async () => (await readStorage<Record<string, SetLog>>(tabB, PROGRESS_KEY))?.['w1-d1-e2-0']?.completed)
      .toBe(true);

    // Tab A's entry survived tab B's write.
    const progress = await readStorage<Record<string, SetLog>>(tabB, PROGRESS_KEY);
    expect(progress?.['w1-d1-e1-0']).toMatchObject({ completed: true, weight: '60' });
    expect(progress?.['w1-d1-e2-0']).toMatchObject({ completed: true });

    // And tab A still shows it after a reload: set 1 ticked, weight intact.
    await tabA.reload();
    const hpcAfter = exerciseSection(tabA, 'Hang Power Clean');
    await expect(hpcAfter.getByRole('button', { name: 'Mark set incomplete' })).toHaveCount(1);
    await expect(hpcAfter.locator('input[inputmode="decimal"]').first()).toHaveValue('60');
  });
});
