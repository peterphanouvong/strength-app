import { test, expect } from '@playwright/test';

// Highest-stakes release behaviour: an EXISTING user (logged sets in the old
// progress key, no vb-programme-v1 yet) must lose nothing when the programme
// store forks the seed on first load.
test('existing logged progress survives the programme-store migration', async ({ page }) => {
  await page.goto('/');
  // Simulate a pre-migration user: logged sets + history, NO vb-programme-v1.
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem(
      'volleyball-workout-progress-v3',
      JSON.stringify({
        'w1-d1-e2-0': { completed: true, weight: '80', actualReps: '6' },
      })
    );
  });
  await page.reload();
  await page.goto('/workout/w1-d1');
  await expect(page.getByRole('heading', { name: /Back Squat/ })).toBeVisible();

  // The logged set renders completed with its weight.
  const backSquatSection = page
    .locator('main section')
    .filter({ has: page.getByRole('heading', { name: /Back Squat/ }) });
  await expect(backSquatSection.locator('input[inputmode="decimal"]').first()).toHaveValue('80');

  // And the programme store now exists with the seed ids.
  const programme = await page.evaluate(() => JSON.parse(localStorage.getItem('vb-programme-v1')!));
  expect(programme.weeks[0].days[0].exercises[1].id).toBe('w1-d1-e2');
});
