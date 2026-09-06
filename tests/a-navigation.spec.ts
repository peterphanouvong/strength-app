import { test, expect, type Page } from '@playwright/test';
import {
  seedStorage,
  readStorage,
  partialW1D1,
  PROGRESS_KEY,
  SESSION_KEY,
  type SetLog,
} from './helpers/fixtures';

// A — tab navigation + browse-first workout + cancel
// (docs/superpowers/specs/2026-09-05-consumer-flows-design.md, phase A).

type Session = { dayId: string; startedAt: number };

function tabBar(page: Page) {
  return page.getByRole('navigation', { name: 'Main' });
}

function conflictSheet(page: Page) {
  return page.getByRole('dialog', { name: 'Workout in progress' });
}

function cancelSheet(page: Page) {
  return page.getByRole('dialog', { name: 'End workout' });
}

test.describe('A — tab bar', () => {
  test('visible on /, /programme, /week/1 and /profile with all three tabs', async ({ page }) => {
    for (const path of ['/', '/programme', '/week/1', '/profile']) {
      await page.goto(path);
      await expect(tabBar(page)).toBeVisible();
      for (const label of ['Home', 'Programme', 'Profile']) {
        await expect(tabBar(page).getByRole('link', { name: label })).toBeVisible();
      }
    }
  });

  test('hidden on /workout/:id, /complete/:id and /congrats/:id (full-screen focus)', async ({
    page,
  }) => {
    await seedStorage(page, { session: { dayId: 'w1-d1', startedAt: Date.now() } });
    await page.goto('/workout/w1-d1');
    await expect(page.getByRole('heading', { name: 'Lower Strength' })).toBeVisible();
    await expect(tabBar(page)).toHaveCount(0);

    // /complete is the save screen since phase B (spec re-aim from the old congrats layout).
    await page.goto('/complete/w1-d1');
    await expect(page.getByRole('heading', { name: 'Save workout' })).toBeVisible();
    await expect(tabBar(page)).toHaveCount(0);

    await page.goto('/congrats/w1-d1');
    await expect(page.getByRole('heading', { name: /nice\s*work/i })).toBeVisible();
    await expect(tabBar(page)).toHaveCount(0);
  });

  test('tabs navigate: Programme → weeks browser, Profile → profile, Home → dashboard', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: /Good (morning|afternoon|evening)/ })
    ).toBeVisible();

    await tabBar(page).getByRole('link', { name: 'Programme' }).click();
    await expect(page).toHaveURL(/\/programme$/);
    await expect(page.getByRole('heading', { name: /12-week/i })).toBeVisible();

    await tabBar(page).getByRole('link', { name: 'Profile' }).click();
    await expect(page).toHaveURL(/\/profile$/);
    await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible();

    await tabBar(page).getByRole('link', { name: 'Home' }).click();
    await expect(page).toHaveURL(/\/$/);
    await expect(
      page.getByRole('heading', { name: /Good (morning|afternoon|evening)/ })
    ).toBeVisible();
  });
});

test.describe('A — home dashboard skeleton', () => {
  test('greeting + current-week card (clean storage → week 1) linking to the week', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: /Good (morning|afternoon|evening)/ })
    ).toBeVisible();

    const card = page.getByRole('link', { name: /Current week/ });
    await expect(card).toBeVisible();
    await expect(card).toContainText('Week 1');
    await card.click();
    await expect(page).toHaveURL(/\/week\/1$/);
  });

  test('active session shows a "Jump back in" card that resumes the workout', async ({ page }) => {
    await seedStorage(page, { session: { dayId: 'w1-d1', startedAt: Date.now() - 5 * 60_000 } });
    await page.goto('/');

    const card = page.getByRole('button', { name: /Jump back in/ });
    await expect(card).toBeVisible();
    await expect(card).toContainText('Lower Strength');
    await card.click();
    await expect(page).toHaveURL(/\/workout\/w1-d1$/);
  });

  test('no active session → no "Jump back in" card (and no fake streak/PR data)', async ({
    page,
  }) => {
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: /Good (morning|afternoon|evening)/ })
    ).toBeVisible();
    await expect(page.getByRole('button', { name: /Jump back in/ })).toHaveCount(0);
    await expect(page.getByText(/streak/i)).toHaveCount(0);
  });
});

test.describe('A — profile skeleton', () => {
  test('heading + rest-notification permission control', async ({ page }) => {
    await page.goto('/profile');
    await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Preferences' })).toBeVisible();
    await expect(page.getByText('Rest notifications')).toBeVisible();
    // One of the three permission states renders (button / on / blocked).
    await expect(
      page.getByText(/Turn on|^On$|Blocked in settings|Not supported/)
    ).toBeVisible();
  });
});

test.describe('A — browse-first workout', () => {
  test('opening a workout writes no session key and renders preview: Start CTA, no Finish, inputs read-only', async ({
    page,
  }) => {
    await page.goto('/workout/w1-d1');
    await expect(page.getByRole('heading', { name: 'Lower Strength' })).toBeVisible();

    // Full plan browsable, preview header state, sticky Start CTA.
    await expect(page.getByText('Hang Power Clean')).toBeVisible();
    await expect(page.getByText('Preview')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start workout' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Finish' })).toHaveCount(0);
    await expect(page.locator('input[inputmode="decimal"]').first()).toBeDisabled();

    // Give any stray effect a moment to (wrongly) write the key, then assert it never did.
    await page.waitForTimeout(1_000);
    expect(await readStorage(page, SESSION_KEY)).toBeNull();
  });

  test('Start workout goes live: session written for this day, Finish appears, duration ticks', async ({
    page,
  }) => {
    await page.goto('/workout/w1-d1');
    const before = Date.now();
    await page.getByRole('button', { name: 'Start workout' }).click();

    const session = await readStorage<Session>(page, SESSION_KEY);
    expect(session?.dayId).toBe('w1-d1');
    expect(session!.startedAt).toBeGreaterThanOrEqual(before - 1_000);
    expect(session!.startedAt).toBeLessThanOrEqual(Date.now() + 1_000);

    await expect(page.getByRole('button', { name: 'Finish' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start workout' })).toHaveCount(0);
    await expect(page.locator('input[inputmode="decimal"]').first()).toBeEnabled();
    // Duration is ticking (m:ss, no em-dash placeholder).
    await expect(page.locator('p:text-is("Duration") + p')).toHaveText(/^\d+:\d{2}$/);
  });

  test('set-tap in preview starts the session AND logs that set (one-tap flow)', async ({
    page,
  }) => {
    await page.goto('/workout/w1-d1');
    await expect(page.getByRole('button', { name: 'Start workout' })).toBeVisible();

    await page.getByRole('button', { name: 'Mark set complete' }).first().click();

    await expect(page.getByRole('button', { name: 'Finish' })).toBeVisible();
    const session = await readStorage<Session>(page, SESSION_KEY);
    expect(session?.dayId).toBe('w1-d1');
    const progress = await readStorage<Record<string, SetLog>>(page, PROGRESS_KEY);
    expect(progress?.['w1-d1-e1-0']).toMatchObject({ completed: true });
  });
});

test.describe('A — cancel workout', () => {
  test('"End workout, keep sets": session ends, progress intact, back on the week', async ({
    page,
  }) => {
    await seedStorage(page, {
      progress: partialW1D1(),
      session: { dayId: 'w1-d1', startedAt: Date.now() - 8 * 60_000 },
    });
    await page.goto('/workout/w1-d1');

    await page.getByRole('button', { name: 'Workout options' }).click();
    await expect(cancelSheet(page)).toBeVisible();
    await cancelSheet(page).getByRole('button', { name: 'End workout, keep sets' }).click();

    await expect(page).toHaveURL(/\/week\/1$/);
    expect(await readStorage(page, SESSION_KEY)).toBeNull();
    const progress = await readStorage<Record<string, SetLog>>(page, PROGRESS_KEY);
    expect(progress?.['w1-d1-e1-0']).toMatchObject({ completed: true, weight: '60' });
    expect(progress?.['w1-d1-e2-0']).toMatchObject({ completed: true, weight: '80' });
  });

  test('"Discard workout": inline confirm names the set count, then clears only this day and ends the session', async ({
    page,
  }) => {
    // partialW1D1 = 3 completed w1-d1 sets; the w1-d2 entry proves discard is day-scoped.
    const progress = {
      ...partialW1D1(),
      'w1-d2-e1-0': { completed: true, weight: '40', actualReps: '5' } as SetLog,
    };
    await seedStorage(page, { progress, session: { dayId: 'w1-d1', startedAt: Date.now() } });
    await page.goto('/workout/w1-d1');

    await page.getByRole('button', { name: 'Workout options' }).click();
    const sheet = cancelSheet(page);
    await expect(sheet).toBeVisible();

    // Discard is secondary and requires an inline confirm naming the count.
    await sheet.getByRole('button', { name: 'Discard workout' }).click();
    await expect(sheet.getByText('This clears 3 logged sets.')).toBeVisible();
    // Keep-sets stays available until the confirm.
    await expect(sheet.getByRole('button', { name: 'End workout, keep sets' })).toBeVisible();

    await sheet.getByRole('button', { name: 'Yes, discard' }).click();
    await expect(page).toHaveURL(/\/week\/1$/);

    expect(await readStorage(page, SESSION_KEY)).toBeNull();
    const after = await readStorage<Record<string, SetLog>>(page, PROGRESS_KEY);
    expect(Object.keys(after ?? {}).filter((k) => k.startsWith('w1-d1-'))).toHaveLength(0);
    expect(after?.['w1-d2-e1-0']).toMatchObject({ completed: true, weight: '40' });
  });

  test('closing the cancel sheet resets the inline confirm and stays live', async ({ page }) => {
    await seedStorage(page, {
      progress: partialW1D1(),
      session: { dayId: 'w1-d1', startedAt: Date.now() },
    });
    await page.goto('/workout/w1-d1');

    await page.getByRole('button', { name: 'Workout options' }).click();
    await cancelSheet(page).getByRole('button', { name: 'Discard workout' }).click();
    await expect(cancelSheet(page).getByText(/This clears/)).toBeVisible();
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(cancelSheet(page)).toBeHidden();

    // Still live, nothing lost.
    await expect(page.getByRole('button', { name: 'Finish' })).toBeVisible();
    expect((await readStorage<Session>(page, SESSION_KEY))?.dayId).toBe('w1-d1');
    // Reopening starts from the un-confirmed state again.
    await page.getByRole('button', { name: 'Workout options' }).click();
    await expect(cancelSheet(page).getByRole('button', { name: 'Discard workout' })).toBeVisible();
    await expect(cancelSheet(page).getByText(/This clears/)).toHaveCount(0);
  });
});

test.describe('A — conflict moves to Start', () => {
  test('browsing another day never raises the sheet; Start does, with all three actions', async ({
    page,
  }) => {
    await seedStorage(page, { session: { dayId: 'w1-d1', startedAt: Date.now() - 12 * 60_000 } });
    await page.goto('/workout/w1-d2');
    await expect(page.getByRole('heading', { name: 'Upper Push' })).toBeVisible();
    await expect(conflictSheet(page)).toHaveCount(0);

    await page.getByRole('button', { name: 'Start workout' }).click();
    const sheet = conflictSheet(page);
    await expect(sheet).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Go back to that workout' })).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'End it and start this one' })).toBeVisible();
    await expect(sheet.getByRole('button', { name: 'Discard the other workout' })).toBeVisible();

    // The unresolved conflict did not overwrite the running session.
    expect((await readStorage<Session>(page, SESSION_KEY))?.dayId).toBe('w1-d1');
  });

  test('"Discard the other workout" clears the other day\'s sets and starts this one', async ({
    page,
  }) => {
    await seedStorage(page, {
      progress: { ...partialW1D1(), 'w2-d1-e1-0': { completed: true, weight: '65' } as SetLog },
      session: { dayId: 'w1-d1', startedAt: Date.now() - 12 * 60_000 },
    });
    await page.goto('/workout/w1-d2');
    await page.getByRole('button', { name: 'Start workout' }).click();

    const before = Date.now();
    await conflictSheet(page).getByRole('button', { name: 'Discard the other workout' }).click();
    await expect(conflictSheet(page)).toBeHidden();

    // This day is live on a fresh session.
    const session = await readStorage<Session>(page, SESSION_KEY);
    expect(session?.dayId).toBe('w1-d2');
    expect(session!.startedAt).toBeGreaterThanOrEqual(before - 1_000);
    await expect(page.getByRole('button', { name: 'Finish' })).toBeVisible();

    // The other day's sets are gone; unrelated entries survive.
    const progress = await readStorage<Record<string, SetLog>>(page, PROGRESS_KEY);
    expect(Object.keys(progress ?? {}).filter((k) => k.startsWith('w1-d1-'))).toHaveLength(0);
    expect(progress?.['w2-d1-e1-0']).toMatchObject({ completed: true, weight: '65' });
  });

  test('set-tap while another workout runs raises the sheet without starting or logging', async ({
    page,
  }) => {
    await seedStorage(page, { session: { dayId: 'w1-d1', startedAt: Date.now() - 5 * 60_000 } });
    await page.goto('/workout/w1-d2');

    await page.getByRole('button', { name: 'Mark set complete' }).first().click();
    await expect(conflictSheet(page)).toBeVisible();

    expect((await readStorage<Session>(page, SESSION_KEY))?.dayId).toBe('w1-d1');
    const progress = await readStorage<Record<string, SetLog>>(page, PROGRESS_KEY);
    expect(progress?.['w1-d2-e1-0']?.completed).not.toBe(true);
  });
});
