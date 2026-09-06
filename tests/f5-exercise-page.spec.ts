import { test, expect } from '@playwright/test';
import { seedStorage, squatHistory3Weeks } from './helpers/fixtures';

// F5 — exercise detail page. PR / personal-best rows link to /exercise/:name,
// which shows the best summary, the progression chart, and the full week-by-week
// history (the same content as the in-workout history sheet, on its own page).

test.describe('F5 — exercise detail page', () => {
  test('Profile personal-best row links to /exercise/Back Squat with best, chart and history', async ({
    page,
  }) => {
    await seedStorage(page, { progress: squatHistory3Weeks() });
    await page.goto('/profile');

    await page
      .getByRole('list', { name: 'Personal bests' })
      .getByRole('link', { name: /Back Squat/ })
      .click();

    await expect(page).toHaveURL(/\/exercise\/Back%20Squat$/);
    await expect(page.getByRole('heading', { name: 'Back Squat', level: 1 })).toBeVisible();

    // Best summary card: the seeded heaviest set (90 kg × 6 in week 3).
    const bestCard = page.locator('section > div').filter({ hasText: 'Best set' });
    await expect(bestCard).toBeVisible();
    await expect(bestCard.getByText('90 kg × 6')).toBeVisible();

    // Progression chart with its heaviest-set callout.
    await expect(page.getByText(/Heaviest set/)).toBeVisible();
    const chartSvg = page.locator('svg[viewBox="0 0 320 96"]');
    await expect(chartSvg).toBeVisible();
    await expect(chartSvg.locator('circle')).toHaveCount(3);

    // Full history, most recent week first.
    await expect(page.getByText(/^Week \d+$/)).toHaveText(['Week 3', 'Week 2', 'Week 1']);
  });

  test('Home recent-PR row links to the same page', async ({ page }) => {
    await seedStorage(page, { progress: squatHistory3Weeks() });
    await page.goto('/');

    await page
      .getByRole('list', { name: 'Recent PRs' })
      .getByRole('link', { name: /Back Squat/ })
      .click();

    await expect(page).toHaveURL(/\/exercise\/Back%20Squat$/);
    await expect(page.getByRole('heading', { name: 'Back Squat', level: 1 })).toBeVisible();
  });

  test('an exercise with no logs shows the empty-state copy', async ({ page }) => {
    await page.goto('/exercise/Hang%20Power%20Clean');
    await expect(page.getByRole('heading', { name: 'Hang Power Clean', level: 1 })).toBeVisible();
    await expect(page.getByText(/No sets logged yet/)).toBeVisible();
    await expect(page.getByText(/^Week \d+$/)).toHaveCount(0);
  });

  test('an exercise name not in the plan shows not-found, not a crash', async ({ page }) => {
    const errors: Error[] = [];
    page.on('pageerror', (e) => errors.push(e));

    await page.goto('/exercise/Nonsense%20Lift');
    await expect(page.getByText(/Exercise not found/)).toBeVisible();

    expect(errors).toEqual([]);
  });
});
