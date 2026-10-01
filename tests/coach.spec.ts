import { test, expect } from '@playwright/test';

const PROPOSAL = {
  text: 'Lightening Friday so your legs are fresh for Saturday.',
  proposal: {
    summary: 'Taper legs before the comp',
    ops: [{ type: 'update-exercise', exerciseId: 'w1-d1-e2', patch: { sets: 2, load: '60% TM' } }],
  },
};

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('vb-coach-token-v1', 'tok'));
});

test('a proposal renders a diff card; apply mutates the programme', async ({ page }) => {
  await page.route('**/functions/v1/ai-coach', (route) =>
    route.fulfill({ json: PROPOSAL })
  );
  await page.goto('/coach');
  await page.getByRole('textbox', { name: 'Message the coach' }).fill('Comp on Saturday, keep my legs fresh');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText('Taper legs before the comp')).toBeVisible();
  await expect(page.getByText(/Back Squat — 4×6 @ 70% TM → 2×6 @ 60% TM/)).toBeVisible();
  await page.getByRole('button', { name: 'Apply' }).click();
  await page.goto('/workout/w1-d1');
  await expect(page.getByText('2 × 6')).toBeVisible();
});

test('401 prompts for the access token', async ({ page }) => {
  await page.route('**/functions/v1/ai-coach', (route) => route.fulfill({ status: 401, json: { error: 'unauthorized' } }));
  await page.goto('/coach');
  await page.getByRole('textbox', { name: 'Message the coach' }).fill('hi');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText(/access token/i)).toBeVisible();
});
