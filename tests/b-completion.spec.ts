import { test, expect, type Page } from '@playwright/test';
import {
  seedStorage,
  readStorage,
  canonicalW1D1,
  partialW1D1,
  historyForWeeks,
  completedWorkout,
  PROGRESS_KEY,
  SESSION_KEY,
  HISTORY_KEY,
  type CompletedWorkout,
  type SetLog,
} from './helpers/fixtures';

// B — save screen + history + calendar/streak congrats
// (docs/superpowers/specs/2026-09-05-consumer-flows-design.md, phase B).

type Session = { dayId: string; startedAt: number };

/** Finish a fully-logged, live w1-d1 → lands on the /complete save screen. */
async function finishToSaveScreen(page: Page, opts: { startedAgoMs?: number } = {}) {
  await seedStorage(page, {
    progress: canonicalW1D1(),
    session: { dayId: 'w1-d1', startedAt: Date.now() - (opts.startedAgoMs ?? 47 * 60_000) },
  });
  await page.goto('/workout/w1-d1');
  await expect(page.getByRole('button', { name: 'Finish' })).toBeVisible();
  await page.getByRole('button', { name: 'Finish' }).click();
  await expect(page).toHaveURL(/\/complete\/w1-d1$/);
}

/** The stat card value that sits under a given label. */
function statValue(page: Page, label: string) {
  return page.getByText(label, { exact: true }).locator('xpath=following-sibling::p[1]');
}

test.describe('B — save screen', () => {
  test('Finish keeps the session alive and lands on the save screen: editable title defaults to the day name, note field, stat card', async ({
    page,
  }) => {
    await finishToSaveScreen(page);

    // Session survives Finish (it ends at Save/Discard, so back is lossless).
    const session = await readStorage<Session>(page, SESSION_KEY);
    expect(session?.dayId).toBe('w1-d1');

    await expect(page.getByRole('heading', { name: 'Save workout' })).toBeVisible();
    await expect(page.getByLabel('Workout title')).toHaveValue('Lower Strength');
    await expect(page.getByLabel('Workout note')).toBeVisible();

    // Stat card recomputed from the progress map — the canonical numbers.
    await expect(statValue(page, 'Sets')).toHaveText('15/15');
    await expect(statValue(page, 'Volume')).toHaveText(/^3,300\s*kg$/);
    await expect(statValue(page, 'Duration')).toHaveText(/^\d+:\d{2}|\d+h \d+m$/);

    // Nothing written to history until Save.
    expect(await readStorage(page, HISTORY_KEY)).toBeNull();
  });

  test('Save writes the CompletedWorkout (with edited title + note), ends the session and lands on /congrats', async ({
    page,
  }) => {
    await finishToSaveScreen(page);

    await page.getByLabel('Workout title').fill('Big leg day');
    await page.getByLabel('Workout note').fill('Felt strong');
    const before = Date.now();
    await page.getByRole('button', { name: 'Save workout' }).click();

    await expect(page).toHaveURL(/\/congrats\/w1-d1$/);
    await expect(page.getByRole('heading', { name: /nice\s*work/i })).toBeVisible();

    // Session ended at Save.
    expect(await readStorage(page, SESSION_KEY)).toBeNull();

    // Exactly one history entry with the spec's shape.
    const history = await readStorage<CompletedWorkout[]>(page, HISTORY_KEY);
    expect(history).toHaveLength(1);
    const entry = history![0];
    expect(entry).toMatchObject({
      dayId: 'w1-d1',
      weekNum: 1,
      dayTitle: 'Day A: Lower Strength',
      volume: 3300,
      setsDone: 15,
      totalSets: 15,
      title: 'Big leg day',
      note: 'Felt strong',
    });
    expect(entry.completedAt).toBeGreaterThanOrEqual(before - 1000);
    expect(entry.completedAt).toBeLessThanOrEqual(Date.now() + 1000);
    expect(entry.id).toBe(`w1-d1-${entry.completedAt}`);
    expect(entry.elapsed).toBeGreaterThanOrEqual(46 * 60); // seeded ~47 min ago

    // Progress entries are kept — Save is not a discard.
    const progress = await readStorage<Record<string, SetLog>>(page, PROGRESS_KEY);
    expect(Object.keys(progress!)).toHaveLength(15);
  });

  test('back arrow returns losslessly to the live workout: session and progress intact, Finish still available', async ({
    page,
  }) => {
    await finishToSaveScreen(page);

    await page.getByRole('button', { name: 'Back to workout' }).click();
    await expect(page).toHaveURL(/\/workout\/w1-d1$/);

    // Live mode again — not preview.
    await expect(page.getByRole('button', { name: 'Finish' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start workout' })).toHaveCount(0);

    const session = await readStorage<Session>(page, SESSION_KEY);
    expect(session?.dayId).toBe('w1-d1');
    const progress = await readStorage<Record<string, SetLog>>(page, PROGRESS_KEY);
    expect(Object.keys(progress!)).toHaveLength(15);
    expect(await readStorage(page, HISTORY_KEY)).toBeNull();
  });

  test('Discard workout is a true discard behind an inline confirm: clears the day\'s sets + session, writes no history, day-scoped', async ({
    page,
  }) => {
    // partialW1D1 (3 completed w1-d1 sets) + a w1-d2 entry proving discard is day-scoped.
    await seedStorage(page, {
      progress: { ...partialW1D1(), 'w1-d2-e1-0': { completed: true, weight: '40', actualReps: '5' } as SetLog },
      session: { dayId: 'w1-d1', startedAt: Date.now() - 10 * 60_000 },
    });
    await page.goto('/workout/w1-d1');
    await page.getByRole('button', { name: 'Finish' }).click();
    await expect(page).toHaveURL(/\/complete\/w1-d1$/);

    // First tap only reveals the inline confirm — nothing is cleared yet.
    await page.getByRole('button', { name: 'Discard workout' }).click();
    await expect(page.getByText(/clears 3 logged sets/)).toBeVisible();
    expect(await readStorage<Session>(page, SESSION_KEY)).not.toBeNull();

    await page.getByRole('button', { name: 'Yes, discard' }).click();
    await expect(page).toHaveURL(/\/week\/1$/);

    expect(await readStorage(page, SESSION_KEY)).toBeNull();
    expect(await readStorage(page, HISTORY_KEY)).toBeNull();
    const progress = await readStorage<Record<string, SetLog>>(page, PROGRESS_KEY);
    expect(Object.keys(progress!).filter((k) => k.startsWith('w1-d1-'))).toHaveLength(0);
    expect(progress?.['w1-d2-e1-0']).toMatchObject({ completed: true, weight: '40' });
  });
});

test.describe('B — congrats page', () => {
  test('first save: calendar marks today mint, "1 week streak" line, first-save copy, Done → week', async ({
    page,
  }) => {
    await finishToSaveScreen(page);
    await page.getByRole('button', { name: 'Save workout' }).click();
    await expect(page).toHaveURL(/\/congrats\/w1-d1$/);

    // Today's calendar cell is both ringed (today) and a mint saved disc.
    await expect(page.locator('[data-today][data-saved]')).toHaveCount(1);

    await expect(page.getByText('1 week streak')).toBeVisible();
    await expect(page.getByText(/first workout/i)).toBeVisible();

    await expect(page.getByRole('button', { name: 'Share' })).toBeVisible();
    await page.getByRole('button', { name: 'Done' }).click();
    await expect(page).toHaveURL(/\/week\/1$/);
  });

  test('streak continuing: saving on top of a 2-week history shows "3 week streak" and continuing copy', async ({
    page,
  }) => {
    await seedStorage(page, {
      progress: canonicalW1D1(),
      session: { dayId: 'w1-d1', startedAt: Date.now() - 40 * 60_000 },
      history: historyForWeeks([1, 2]),
    });
    await page.goto('/workout/w1-d1');
    await page.getByRole('button', { name: 'Finish' }).click();
    await page.getByRole('button', { name: 'Save workout' }).click();
    await expect(page).toHaveURL(/\/congrats\/w1-d1$/);

    await expect(page.getByText('3 week streak')).toBeVisible();
    await expect(page.getByText(/3 weeks in a row/i)).toBeVisible();

    const history = await readStorage<CompletedWorkout[]>(page, HISTORY_KEY);
    expect(history).toHaveLength(3);
  });
});

test.describe('B — streak math (Mon-start weeks, current-week grace)', () => {
  test('3 prior consecutive weeks with an empty current week → 3 week streak (grace)', async ({ page }) => {
    await seedStorage(page, { history: historyForWeeks([1, 2, 3]) });
    await page.goto('/profile');
    await expect(page.getByText('3 week streak')).toBeVisible();
  });

  test('a fully empty prior week breaks it: weeks 1 and 3 ago → 1 week streak', async ({ page }) => {
    await seedStorage(page, { history: historyForWeeks([1, 3]) });
    await page.goto('/profile');
    await expect(page.getByText('1 week streak')).toBeVisible();
  });

  test('grace does not bridge a gap: last workouts 2 and 3 weeks ago → no streak', async ({ page }) => {
    await seedStorage(page, { history: historyForWeeks([2, 3]) });
    await page.goto('/profile');
    await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible();
    await expect(page.getByText(/week streak/)).toHaveCount(0);
  });

  test('a workout this week alone → 1 week streak, and the streak chip reaches Home', async ({ page }) => {
    await seedStorage(page, { history: historyForWeeks([0]) });
    await page.goto('/profile');
    await expect(page.getByText('1 week streak')).toBeVisible();

    await page.goto('/');
    await expect(page.getByText('1 week streak')).toBeVisible();
  });
});

test.describe('B — profile history', () => {
  test('history list renders most-recent-first with title, week, duration/volume/sets; calendar navigates months', async ({
    page,
  }) => {
    await seedStorage(page, {
      history: [
        completedWorkout(2, { title: 'Oldest session' }),
        completedWorkout(0, { title: 'Newest session' }),
        completedWorkout(1, { title: 'Middle session' }),
      ],
    });
    await page.goto('/profile');

    const list = page.getByRole('list', { name: 'Workout history' });
    await expect(list.getByRole('listitem')).toHaveCount(3);
    await expect(list.getByRole('listitem').nth(0)).toContainText('Newest session');
    await expect(list.getByRole('listitem').nth(1)).toContainText('Middle session');
    await expect(list.getByRole('listitem').nth(2)).toContainText('Oldest session');
    await expect(list.getByRole('listitem').nth(0)).toContainText('Week 1');
    await expect(list.getByRole('listitem').nth(0)).toContainText('47:00');
    await expect(list.getByRole('listitem').nth(0)).toContainText('3,300 kg');
    await expect(list.getByRole('listitem').nth(0)).toContainText('15/15');

    // Untitled entries fall back to the day name.
    await seedStorage(page, { history: [completedWorkout(0)] });
    await page.goto('/profile');
    await expect(list.getByRole('listitem').first()).toContainText('Lower Strength');

    // Month calendar is navigable: prev then next returns to the current month.
    const monthLabel = new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    await expect(page.getByText(monthLabel)).toBeVisible();
    await page.getByRole('button', { name: 'Previous month' }).click();
    await expect(page.getByText(monthLabel)).toHaveCount(0);
    await page.getByRole('button', { name: 'Next month' }).click();
    await expect(page.getByText(monthLabel)).toBeVisible();

    // Today is marked saved (the weeksAgo=0 entry).
    await expect(page.locator('[data-today][data-saved]')).toHaveCount(1);
  });

  test('empty history: profile still renders calendar + notification control, with an empty-state message and no streak', async ({
    page,
  }) => {
    await page.goto('/profile');
    await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible();
    const monthLabel = new Date().toLocaleDateString('en-GB', { month: 'long', year: 'numeric' });
    await expect(page.getByText(monthLabel)).toBeVisible();
    await expect(page.getByText(/No workouts saved yet/)).toBeVisible();
    await expect(page.getByText(/week streak/)).toHaveCount(0);
    await expect(page.getByRole('heading', { name: 'Rest notifications' })).toBeVisible();
  });
});
