import { test, expect, Page } from '@playwright/test';

// Swipe-left on a set row reveals a Delete button (Hevy-style). Deleting a
// middle set remaps the logs below it so weights stay on the right sets.
// Back Squat (w1-d1-e2) prescribes 4 sets in week 1.

function backSquatSection(page: Page) {
  return page.locator('section', { has: page.getByRole('heading', { name: /Back Squat/ }) });
}

function setChecks(page: Page) {
  return backSquatSection(page).getByRole('button', { name: /Mark set (complete|incomplete)/ });
}

/**
 * Drag a set row ~120px left with the mouse (framer-motion listens to pointer
 * events). The press starts on the set-number cell: framer deliberately won't
 * start drags from form inputs, so mid-row (over the kg/reps inputs) is inert.
 */
async function swipeLeft(page: Page, rowIndex: number) {
  const row = backSquatSection(page).locator('[data-testid="set-row"]').nth(rowIndex);
  await row.scrollIntoViewIfNeeded();
  const box = (await row.boundingBox())!;
  const startX = box.x + 20;
  const y = box.y + box.height / 2;
  await page.mouse.move(startX, y);
  await page.mouse.down();
  for (let i = 1; i <= 8; i++) {
    await page.mouse.move(startX - (120 * i) / 8, y, { steps: 3 });
  }
  await page.mouse.up();
}

test('swipe reveals delete; deleting a middle set remaps the logs below it', async ({ page }) => {
  await page.goto('/workout/w1-d1');
  await page.getByRole('button', { name: 'Start workout' }).click();

  const section = backSquatSection(page);
  const weightInputs = section.locator('input[inputmode="decimal"]');
  // Log weights on sets 2 and 3 (indices 1, 2).
  await weightInputs.nth(1).fill('85');
  await weightInputs.nth(2).fill('90');

  await swipeLeft(page, 1); // set 2
  const del = page.getByRole('button', { name: 'Delete set 2 of Back Squat' });
  await expect(del).toBeVisible();
  await del.click();

  await expect(setChecks(page)).toHaveCount(3);
  // Set 2's log is gone; set 3's 90 kg moved up into the new set 2 slot.
  await expect(weightInputs.nth(1)).toHaveValue('90');
  await expect(weightInputs.nth(2)).toHaveValue('');

  // Persisted.
  await page.reload();
  await expect(setChecks(page)).toHaveCount(3);
  await expect(backSquatSection(page).locator('input[inputmode="decimal"]').nth(1)).toHaveValue('90');
});

test('swipe does nothing in plain preview (not live, not edit mode)', async ({ page }) => {
  await page.goto('/workout/w1-d1');
  await swipeLeft(page, 1);
  await expect(page.getByRole('button', { name: /Delete set/ })).toHaveCount(0);
  await expect(setChecks(page)).toHaveCount(4);
});

test('the only remaining set cannot be swipe-deleted', async ({ page }) => {
  await page.goto('/workout/w1-d1');
  await page.getByRole('button', { name: 'Start workout' }).click();
  // Delete sets down to one.
  for (let remaining = 4; remaining > 1; remaining--) {
    await swipeLeft(page, remaining - 1);
    await page.getByRole('button', { name: `Delete set ${remaining} of Back Squat` }).click();
  }
  await expect(setChecks(page)).toHaveCount(1);
  await swipeLeft(page, 0);
  await expect(page.getByRole('button', { name: /Delete set/ })).toHaveCount(0);
  await expect(setChecks(page)).toHaveCount(1);
});

test('swiping a second row closes the first reveal', async ({ page }) => {
  await page.goto('/workout/w1-d1');
  await page.getByRole('button', { name: 'Start workout' }).click();
  await swipeLeft(page, 0);
  await expect(page.getByRole('button', { name: 'Delete set 1 of Back Squat' })).toBeVisible();
  await swipeLeft(page, 2);
  await expect(page.getByRole('button', { name: 'Delete set 3 of Back Squat' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Delete set 1 of Back Squat' })).toHaveCount(0);
});
