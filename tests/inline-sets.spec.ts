import { test, expect } from '@playwright/test';

// Inline Hevy-style set editing: an "Add set" row per exercise during a live
// workout (and in preview edit mode), plus remove-last-set when un-logged.
// Back Squat (w1-d1-e2) prescribes 4 sets in week 1.

function backSquatSection(page: import('@playwright/test').Page) {
  return page.locator('section', { has: page.getByRole('heading', { name: /Back Squat/ }) });
}

function setChecks(page: import('@playwright/test').Page) {
  return backSquatSection(page).getByRole('button', { name: /Mark set (complete|incomplete)/ });
}

test('add a set mid-workout, log it, and it persists', async ({ page }) => {
  await page.goto('/workout/w1-d1');
  await page.getByRole('button', { name: 'Start workout' }).click();
  await expect(setChecks(page)).toHaveCount(4);

  await page.getByRole('button', { name: 'Add set to Back Squat' }).click();
  await expect(setChecks(page)).toHaveCount(5);

  // The new row is immediately loggable.
  await setChecks(page).nth(4).click();
  await expect(backSquatSection(page).getByRole('button', { name: 'Mark set incomplete' })).toHaveCount(1);

  // Programme edit persisted — survives reload.
  await page.reload();
  await expect(setChecks(page)).toHaveCount(5);
  await expect(backSquatSection(page).getByRole('button', { name: 'Mark set incomplete' })).toHaveCount(1);
});

test('remove the last set while it is un-logged', async ({ page }) => {
  await page.goto('/workout/w1-d1');
  await page.getByRole('button', { name: 'Start workout' }).click();
  await page.getByRole('button', { name: 'Add set to Back Squat' }).click();
  await expect(setChecks(page)).toHaveCount(5);

  await page.getByRole('button', { name: 'Remove last set from Back Squat' }).click();
  await expect(setChecks(page)).toHaveCount(4);
});

test('no remove affordance when the last set is logged', async ({ page }) => {
  await page.goto('/workout/w1-d1');
  await page.getByRole('button', { name: 'Start workout' }).click();
  await setChecks(page).nth(3).click(); // log the last prescribed set
  await expect(page.getByRole('button', { name: 'Remove last set from Back Squat' })).toHaveCount(0);
  // Adding is still allowed.
  await expect(page.getByRole('button', { name: 'Add set to Back Squat' })).toBeVisible();
});

test('plain preview (not live, not edit mode) shows no inline set controls', async ({ page }) => {
  await page.goto('/workout/w1-d1');
  await expect(page.getByRole('button', { name: 'Add set to Back Squat' })).toHaveCount(0);
  await expect(page.getByRole('button', { name: 'Remove last set from Back Squat' })).toHaveCount(0);
});

test('edit mode in preview shows the add-set row', async ({ page }) => {
  await page.goto('/workout/w1-d1');
  await page.getByRole('button', { name: 'Edit workout' }).click();
  await page.getByRole('button', { name: 'Add set to Back Squat' }).click();
  await expect(setChecks(page)).toHaveCount(5);
});
