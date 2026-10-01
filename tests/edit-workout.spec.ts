import { test, expect } from '@playwright/test';
import { PROGRESS_KEY } from './helpers/fixtures';

// Task 6 — manual edit UI: WorkoutPage edit mode + EditExerciseSheet.
// Edits flow through applyEdits (src/lib/programme/store.ts), which persists
// the programme at vb-programme-v1 — so a saved edit survives reload.

test('edit an exercise prescription from the workout page', async ({ page }) => {
  await page.goto('/workout/w1-d1');
  await page.getByRole('button', { name: 'Edit workout' }).click();
  await page.getByRole('button', { name: 'Edit Back Squat' }).click();
  await page.getByLabel('Sets').fill('3');
  await page.getByLabel('Reps').fill('5');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('3 × 5')).toBeVisible();
  // survives reload (persisted)
  await page.reload();
  await expect(page.getByText('3 × 5')).toBeVisible();
});

test('undo restores the previous prescription', async ({ page }) => {
  await page.goto('/workout/w1-d1');
  await page.getByRole('button', { name: 'Edit workout' }).click();
  await page.getByRole('button', { name: 'Edit Back Squat' }).click();
  await page.getByLabel('Sets').fill('2');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('2 × 6')).toBeVisible();
  await page.getByRole('button', { name: 'Undo last edit' }).click();
  await expect(page.getByText('4 × 6')).toBeVisible();
});

test('removing an exercise with logged sets shows a warning first', async ({ page }) => {
  await page.goto('/workout/w1-d1');
  await page.evaluate(
    (key) => {
      localStorage.setItem(key, JSON.stringify({ 'w1-d1-e2-0': { completed: true } }));
    },
    PROGRESS_KEY
  );
  await page.reload();
  await page.getByRole('button', { name: 'Edit workout' }).click();
  await page.getByRole('button', { name: 'Edit Back Squat' }).click();
  await page.getByRole('button', { name: 'Remove exercise' }).click();
  await expect(page.getByText(/logged sets/i)).toBeVisible();
  await page.getByRole('button', { name: 'Remove anyway' }).click();
  await expect(page.getByRole('heading', { name: /Back Squat/ })).toHaveCount(0);
});

test('add a new exercise to the day', async ({ page }) => {
  await page.goto('/workout/w1-d1');
  await page.getByRole('button', { name: 'Edit workout' }).click();
  await page.getByRole('button', { name: 'Add exercise' }).click();
  const sheet = page.getByRole('dialog');
  await sheet.getByLabel('Name').fill('Calf Raise');
  await sheet.getByLabel('Reps').fill('12');
  await sheet.getByRole('button', { name: 'Add exercise' }).click();
  await expect(page.getByRole('heading', { name: /Calf Raise/ })).toBeVisible();
});
