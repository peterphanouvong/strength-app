import { test, expect } from '@playwright/test';
import { PROGRESS_KEY } from './helpers/fixtures';

// Task 7 — manual edit UI: WeekOverview day menu (move/remove).
// Edits flow through applyEdits (src/lib/programme/store.ts), which persists
// the programme at vb-programme-v1 and re-renders via useWeeks().

test('move a day down reorders the week', async ({ page }) => {
  await page.goto('/week/1');
  await page.getByRole('button', { name: 'Day options for Day A: Lower Strength' }).click();
  await page.getByRole('button', { name: 'Move down' }).click();
  const cards = page.locator('main h3');
  // Day A moved down past Day B, so Day B ("Upper Push") is now first.
  await expect(cards.first()).toHaveText('Upper Push');
});

test('remove a day', async ({ page }) => {
  await page.goto('/week/1');
  await page.getByRole('button', { name: 'Day options for Day D: Upper Pull + Overhead' }).click();
  await page.getByRole('button', { name: 'Remove day' }).click();
  await page.getByRole('button', { name: 'Remove anyway' }).click();
  await expect(page.getByText('Upper Pull')).toHaveCount(0);
});

// Regression: removing a day with logged sets must warn before applying —
// the warning is actionable ("Remove anyway" applies it), not a dead end.
test('removing a day with logged sets warns before removing', async ({ page }) => {
  await page.goto('/week/1');
  await page.evaluate(
    (key) => {
      localStorage.setItem(key, JSON.stringify({ 'w1-d4-e1-0': { completed: true } }));
    },
    PROGRESS_KEY
  );
  await page.reload();
  await page.getByRole('button', { name: 'Day options for Day D: Upper Pull + Overhead' }).click();
  await page.getByRole('button', { name: 'Remove day' }).click();
  await expect(page.getByText(/logged sets/i)).toBeVisible();
  await page.getByRole('button', { name: 'Remove anyway' }).click();
  await expect(page.getByText('Upper Pull')).toHaveCount(0);
});

// Regression: a genuine dry-run/apply ERROR (removing the last day in a week)
// must not be routed into the actionable confirm panel — no "Remove anyway"
// button, and the day must survive since nothing was ever applied.
test('removing the last day in a week is blocked, not silently applied', async ({ page }) => {
  await page.goto('/week/1');
  for (const title of ['Day A: Lower Strength', 'Day B: Upper Push', 'Day C: Lower Power + Sprints']) {
    await page.getByRole('button', { name: `Day options for ${title}` }).click();
    await page.getByRole('button', { name: 'Remove day' }).click();
    await page.getByRole('button', { name: 'Remove anyway' }).click();
  }

  // Only Day D is left — attempting to remove it must be blocked.
  await page.getByRole('button', { name: 'Day options for Day D: Upper Pull + Overhead' }).click();
  await page.getByRole('button', { name: 'Remove day' }).click();
  await expect(page.getByText(/leave the week empty/i)).toBeVisible();
  await expect(page.getByRole('button', { name: 'Remove anyway' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Got it' }).click();

  await expect(page.locator('main').getByText('Upper Pull')).toBeVisible();
});
