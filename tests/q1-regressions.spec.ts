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

// Q1 — stale tab's Finish must not delete another tab's active session.
// Pre-fix, finishWorkout() → clear() → endSession() removed vb-active-session-v1
// unconditionally, with no check that the session still belonged to that tab's
// day — so a tab whose session had been taken over ("End it and start this one"
// in another tab) wiped the new tab's running session: the pill vanished and the
// elapsed timer restarted from 0 on reload.

test.describe('Q1 — stale tab Finish does not delete another tab’s session', () => {
  test('tab A Finish after tab B took over leaves tab B’s w1-d2 session intact (startedAt preserved)', async ({
    page,
    context,
  }) => {
    // Tab A starts w1-d1 — a session for it lands in storage.
    const tabA = page;
    await tabA.goto('/workout/w1-d1');
    await expect
      .poll(async () => (await readStorage<Session>(tabA, SESSION_KEY))?.dayId)
      .toBe('w1-d1');

    // Tab B opens w1-d2, gets the conflict sheet, and takes over.
    const tabB = await context.newPage();
    await tabB.goto('/workout/w1-d2');
    await expect(conflictSheet(tabB)).toBeVisible();
    await tabB.getByRole('button', { name: 'End it and start this one' }).click();
    await expect
      .poll(async () => (await readStorage<Session>(tabB, SESSION_KEY))?.dayId)
      .toBe('w1-d2');
    const takenOver = await readStorage<Session>(tabB, SESSION_KEY);

    // Tab A — unaware, its conflict state was computed at mount — taps Finish.
    // (No sets logged, so it just navigates back to the week overview.)
    await tabA.getByRole('button', { name: 'Finish' }).click();
    await expect(tabA).toHaveURL(/\/week\/1$/);

    // Tab B's running session survived: same dayId AND same startedAt.
    const after = await readStorage<Session>(tabB, SESSION_KEY);
    expect(after).toEqual(takenOver);

    // And it survives a reload — the elapsed timer resumes, not restarts.
    await tabB.reload();
    const reloaded = await readStorage<Session>(tabB, SESSION_KEY);
    expect(reloaded).toEqual(takenOver);
  });
});

// Q1 — a running rest countdown must survive in-app navigation. Pre-fix, `rest`
// was plain WorkoutPage useState and the countdown interval was cleared on
// unmount, so the two-tap round trip (back to /week/1, straight back in)
// silently destroyed the timer: no bar on return, and the expiry
// haptic/sound/notification never fired — exactly the stepped-away case the
// "Notify me when rest ends" promise exists for.

test.describe('Q1 — rest countdown survives in-app navigation', () => {
  test('rest bar is still there, still ticking, after back to /week/1 and returning', async ({
    page,
  }) => {
    const restBar = page.locator('div.fixed.bottom-4').filter({ hasText: 'Rest ·' });
    const displayedRemaining = async () => {
      const text = await restBar.getByText(/^\d+:\d{2}$/).textContent();
      const [m, s] = (text ?? '0:00').split(':').map(Number);
      return m * 60 + s;
    };

    await page.goto('/workout/w1-d1');
    await expect(page.getByRole('heading', { name: /Hang Power Clean/ })).toBeVisible();

    // Tick the first Hang Power Clean set — 3:00 default rest starts.
    await page.getByRole('button', { name: 'Mark set complete' }).first().click();
    await expect(restBar).toBeVisible();
    await expect(restBar).toContainText('Rest · Hang Power Clean');

    // In-app round trip: back button to the week overview, then straight back in.
    await page.getByRole('button', { name: 'Back to week' }).click();
    await expect(page).toHaveURL(/\/week\/1$/);
    await page.getByRole('link', { name: /Lower Strength/ }).click();
    await expect(page).toHaveURL(/\/workout\/w1-d1$/);

    // The countdown survived: bar visible with ~3:00 minus the round trip left.
    await expect(restBar).toBeVisible();
    const remaining = await displayedRemaining();
    expect(remaining).toBeGreaterThan(150); // generous slack for a slow round trip
    expect(remaining).toBeLessThanOrEqual(180);

    // And it is still ticking (the interval is alive, so expiry feedback can fire).
    await expect
      .poll(async () => remaining - (await displayedRemaining()), { timeout: 4_000 })
      .toBeGreaterThanOrEqual(1);
  });
});

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

// Q1 — TopWeightChart callout must name the actual heaviest set, not the most
// recent week's top weight. Pre-fix it rendered points[points.length - 1] (the
// latest chronological point) under the "Heaviest set" label, so a lighter
// recent week masked an earlier PR.

test.describe('Q1 — history chart callout shows the true heaviest set', () => {
  test('Bench Press logged 100 kg in week 1 and 80 kg in week 5 → callout reads 100 kg in week 1', async ({
    page,
  }) => {
    // Bench Press is w1-d2-e1 (block 1) and w5-d2-e2 (block 2) in the static plan.
    await seedStorage(page, {
      progress: {
        'w1-d2-e1-0': { completed: true, weight: '100', actualReps: '5' },
        'w5-d2-e2-0': { completed: true, weight: '80', actualReps: '5' },
      },
    });
    await page.goto('/workout/w5-d2');

    // Open the exercise history sheet via the Bench Press title.
    await page.getByRole('button', { name: /Bench Press/ }).first().click();
    const sheet = page.getByRole('dialog', { name: 'Bench Press' });
    await expect(sheet).toBeVisible();

    const callout = sheet.getByText(/Heaviest set/);
    await expect(callout).toBeVisible();
    await expect(callout).toHaveText(/Heaviest set · 100 kg in week 1/);
    // And explicitly not the pre-fix "latest week" reading.
    await expect(callout).not.toHaveText(/80 kg in week 5/);
  });
});

// Q1 — unknown /complete/:id (stale share link / typed URL) must render the same
// not-found state as the sibling routes, not a broken "Week · Workout" header
// with dash stats and confetti whose Done button silently dumps you on /week/1.

test.describe('Q1 — unknown /complete/:id shows not-found, not a broken header', () => {
  test('visiting /complete/no-such-day renders the not-found state instead of "Week · Workout"', async ({
    page,
  }) => {
    await page.goto('/complete/no-such-day');

    await expect(page.getByText('Workout not found.')).toBeVisible();

    // Pre-fix header rendered "Week  · Workout" (weekNum undefined) with — stats.
    await expect(page.getByText('Week · Workout')).toHaveCount(0);
    await expect(page.getByRole('button', { name: 'Done' })).toHaveCount(0);
    await expect(page.getByText('Duration')).toHaveCount(0);

    // The escape hatch goes home, not to the silent /week/1 fallback.
    await page.getByRole('button', { name: 'Back to programme' }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test('a valid direct visit to /complete/w1-d1 still renders its real header', async ({ page }) => {
    await page.goto('/complete/w1-d1');
    await expect(page.getByText(/Week 1 ·/)).toBeVisible();
    await expect(page.getByText('Workout not found.')).toHaveCount(0);
  });
});
