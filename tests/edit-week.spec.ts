import { test, expect } from '@playwright/test';

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
