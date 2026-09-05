import { test, expect } from '@playwright/test';

// Deterministic-gate floor: every route renders real UI on the production build.
test.describe('smoke', () => {
  test('home dashboard renders greeting and current-week card', async ({ page }) => {
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: /Good (morning|afternoon|evening)/ })
    ).toBeVisible();
    await expect(page.getByRole('link', { name: /Current week/ })).toBeVisible();
  });

  test('weeks list at /programme renders all 12 weeks and 3 blocks', async ({ page }) => {
    await page.goto('/programme');
    await expect(page.getByRole('heading', { name: /12-week/i })).toBeVisible();
    for (const block of ['REBUILD', 'LOAD', 'CONVERT']) {
      await expect(page.getByRole('heading', { name: new RegExp(block, 'i') })).toBeVisible();
    }
    await expect(page.getByRole('heading', { name: 'Week 1', exact: true })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Week 12', exact: true })).toBeVisible();
  });

  test('week detail renders day cards', async ({ page }) => {
    await page.goto('/week/1');
    await expect(page.getByRole('heading', { name: 'Week 1' })).toBeVisible();
    await expect(page.getByText('Lower Strength').first()).toBeVisible();
    await expect(page.getByText('Upper Push').first()).toBeVisible();
  });

  test('workout page renders exercises and set rows in preview (browse-first)', async ({
    page,
  }) => {
    await page.goto('/workout/w1-d1');
    await expect(page.getByRole('heading', { name: /Lower Strength/ })).toBeVisible();
    await expect(page.getByText('Hang Power Clean')).toBeVisible();
    await expect(page.getByText('Back Squat')).toBeVisible();
    await expect(page.getByRole('button', { name: 'Start workout' })).toBeVisible();
  });

  test('profile renders heading and the notification control section', async ({ page }) => {
    await page.goto('/profile');
    await expect(page.getByRole('heading', { name: 'Profile' })).toBeVisible();
    await expect(page.getByRole('heading', { name: 'Rest notifications' })).toBeVisible();
  });

  test('unknown workout id shows not-found, not a crash', async ({ page }) => {
    await page.goto('/workout/nope');
    await expect(page.getByText('Workout not found.')).toBeVisible();
  });
});
