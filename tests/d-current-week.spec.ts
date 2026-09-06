import { test, expect } from '@playwright/test';
import { seedStorage, canonicalW1D1, readStorage } from './helpers/fixtures';

const CURRENT_WEEK_KEY = 'vb-current-week-v1';

// Manual override of the Home "Current week" card (spec: docs/superpowers/specs/
// 2026-09-05-consumer-flows-design.md + Peter's 2026-09-07 ask). Automatic = the
// existing heuristic (first week with incomplete sets).

test.describe('current week override', () => {
  test('heuristic default: full w1-d1 log keeps Week 1 current (other days incomplete)', async ({ page }) => {
    await seedStorage(page, { progress: canonicalW1D1() });
    await page.goto('/');
    const card = page.getByRole('link', { name: /Current week/i });
    await expect(card).toContainText('Week 1');
  });

  test('picking a week via the ⋮ sheet updates the card and persists across reload', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Change current week' }).click();
    const sheet = page.getByRole('dialog', { name: 'Set current week' });
    await expect(sheet).toBeVisible();
    await sheet.getByRole('button', { name: /Week 5/ }).click();
    await expect(sheet).toBeHidden();
    await expect(page.getByRole('link', { name: /Current week/i })).toContainText('Week 5');
    expect(await readStorage<number>(page, CURRENT_WEEK_KEY)).toBe(5);

    await page.reload();
    await expect(page.getByRole('link', { name: /Current week/i })).toContainText('Week 5');
  });

  test('the ⋮ button does not navigate to the week page', async ({ page }) => {
    await page.goto('/');
    await page.getByRole('button', { name: 'Change current week' }).click();
    await expect(page).toHaveURL(/\/$/);
  });

  test('Automatic clears the override and returns to the heuristic', async ({ page }) => {
    await seedStorage(page, { progress: canonicalW1D1() });
    await page.addInitScript(() => window.localStorage.setItem('vb-current-week-v1', '9'));
    await page.goto('/');
    await expect(page.getByRole('link', { name: /Current week/i })).toContainText('Week 9');

    await page.getByRole('button', { name: 'Change current week' }).click();
    const sheet = page.getByRole('dialog', { name: 'Set current week' });
    await sheet.getByRole('button', { name: /Automatic/ }).click();
    await expect(sheet).toBeHidden();
    // Heuristic: w1-d1 fully logged but week 1 still incomplete overall → Week 1.
    await expect(page.getByRole('link', { name: /Current week/i })).toContainText('Week 1');
    expect(await page.evaluate(() => window.localStorage.getItem('vb-current-week-v1'))).toBeNull();
  });

  test('sheet marks the active choice and shows week focus lines', async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem('vb-current-week-v1', '5'));
    await page.goto('/');
    await page.getByRole('button', { name: 'Change current week' }).click();
    const sheet = page.getByRole('dialog', { name: 'Set current week' });
    const week5 = sheet.getByRole('button', { name: /Week 5/ });
    await expect(week5).toHaveAttribute('aria-pressed', 'true');
    await expect(sheet.getByRole('button', { name: /Automatic/ })).toHaveAttribute('aria-pressed', 'false');
    await expect(week5).toContainText('New TMs');
  });

  test('corrupt override value falls back to the heuristic without crashing', async ({ page }) => {
    await page.addInitScript(() => window.localStorage.setItem('vb-current-week-v1', '"garbage"'));
    await page.goto('/');
    await expect(page.getByRole('link', { name: /Current week/i })).toContainText('Week 1');
  });
});
