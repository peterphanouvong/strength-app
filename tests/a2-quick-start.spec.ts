import { test, expect } from '@playwright/test';
import { seedStorage, readStorage, SESSION_KEY } from './helpers/fixtures';

// Week-overview day cards: the Start/Resume pill starts the workout directly;
// tapping the card body still opens the preview (Peter, 2026-09-07).

test.describe('day-card quick start', () => {
  test('Start pill starts the session and lands in live mode', async ({ page }) => {
    await page.goto('/week/1');
    await page.getByRole('button', { name: 'Start Lower Strength' }).click();
    await expect(page).toHaveURL(/\/workout\/w1-d1/);
    // Live mode: Finish visible, no Start CTA, session written.
    await expect(page.getByRole('button', { name: 'Finish' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start workout' })).toHaveCount(0);
    const session = await readStorage<{ dayId: string }>(page, SESSION_KEY);
    expect(session?.dayId).toBe('w1-d1');
  });

  test('card body still opens the preview without starting', async ({ page }) => {
    await page.goto('/week/1');
    await page.getByRole('link', { name: /Lower Strength/ }).click();
    await expect(page).toHaveURL(/\/workout\/w1-d1/);
    await expect(page.getByRole('button', { name: 'Start workout' })).toBeVisible();
    expect(await readStorage(page, SESSION_KEY)).toBeNull();
  });

  test('Start pill with another workout running raises the conflict sheet, nothing overwritten', async ({ page }) => {
    await seedStorage(page, { session: { dayId: 'w1-d1', startedAt: Date.now() - 10 * 60_000 } });
    await page.goto('/week/1');
    await page.getByRole('button', { name: 'Start Upper Push' }).click();
    await expect(page).toHaveURL(/\/workout\/w1-d2/);
    await expect(page.getByRole('dialog', { name: 'Workout in progress' })).toBeVisible();
    const session = await readStorage<{ dayId: string }>(page, SESSION_KEY);
    expect(session?.dayId).toBe('w1-d1');
  });

  test('autostart does not re-fire on reload of the workout page', async ({ page }) => {
    await page.goto('/week/1');
    await page.getByRole('button', { name: 'Start Lower Strength' }).click();
    await expect(page.getByRole('button', { name: 'Finish' })).toBeVisible();
    // End the workout via cancel (keep sets), then reload the same URL: must be
    // preview again, not silently restarted.
    await page.getByRole('button', { name: 'Workout options' }).click();
    await page.getByRole('button', { name: 'End workout, keep sets' }).click();
    await expect(page).toHaveURL(/\/week\/1/);
    await page.goto('/workout/w1-d1');
    await expect(page.getByRole('button', { name: 'Start workout' })).toBeVisible();
    expect(await readStorage(page, SESSION_KEY)).toBeNull();
  });

  test('Resume pill on a started day resumes without resetting the session', async ({ page }) => {
    const startedAt = Date.now() - 7 * 60_000;
    await seedStorage(page, {
      session: { dayId: 'w1-d1', startedAt },
      progress: { 'w1-d1-e1-0': { completed: true, weight: '60', actualReps: '3' } },
    });
    await page.goto('/week/1');
    await page.getByRole('button', { name: 'Resume Lower Strength' }).click();
    await expect(page).toHaveURL(/\/workout\/w1-d1/);
    await expect(page.getByRole('button', { name: 'Finish' })).toBeVisible();
    const session = await readStorage<{ dayId: string; startedAt: number }>(page, SESSION_KEY);
    expect(session?.startedAt).toBe(startedAt);
  });
});
