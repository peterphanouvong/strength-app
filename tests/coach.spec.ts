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

test('a text-less tool-call reply is dropped from replay, not bricking the next send', async ({ page }) => {
  const bodies: { messages: { role: string; content: string }[] }[] = [];
  const TEXTLESS_PROPOSAL = {
    text: '',
    proposal: {
      summary: 'Lighten today',
      ops: [{ type: 'update-exercise', exerciseId: 'w1-d1-e2', patch: { sets: 2 } }],
    },
  };
  await page.route('**/functions/v1/ai-coach', async (route) => {
    bodies.push(JSON.parse(route.request().postData() ?? '{}'));
    await route.fulfill({ json: TEXTLESS_PROPOSAL });
  });
  await page.goto('/coach');

  await page.getByRole('textbox', { name: 'Message the coach' }).fill('Tweak today');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText('Lighten today')).toHaveCount(1);

  await page.getByRole('textbox', { name: 'Message the coach' }).fill('Thanks');
  await page.getByRole('button', { name: 'Send' }).click();
  // The second reply rendered at all — a bricked chat would never get here.
  await expect(page.getByText('Lighten today')).toHaveCount(2);

  await expect.poll(() => bodies.length).toBe(2);
  const secondRequestMessages = bodies[1].messages;
  expect(secondRequestMessages.length).toBeGreaterThan(0);
  expect(secondRequestMessages.every((m) => m.content.trim().length > 0)).toBe(true);
});

test('Apply on a proposal with a bad id fails; "Ask coach to fix" sends the error through normal send', async ({ page }) => {
  const bodies: { messages: { role: string; content: string }[] }[] = [];
  const BAD_PROPOSAL = {
    text: 'Try this.',
    proposal: {
      summary: 'Tweak a nonexistent exercise',
      ops: [{ type: 'update-exercise', exerciseId: 'ghost-id', patch: { sets: 2 } }],
    },
  };
  await page.route('**/functions/v1/ai-coach', async (route) => {
    bodies.push(JSON.parse(route.request().postData() ?? '{}'));
    await route.fulfill({ json: BAD_PROPOSAL });
  });
  await page.goto('/coach');

  await page.getByRole('textbox', { name: 'Message the coach' }).fill('Change something');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText('Tweak a nonexistent exercise')).toBeVisible();

  await page.getByRole('button', { name: 'Apply' }).click();
  await expect(page.getByText(/Couldn't apply/i)).toBeVisible();

  await page.getByRole('button', { name: 'Ask coach to fix' }).click();
  await expect.poll(() => bodies.length).toBe(2);
  const secondRequestMessages = bodies[1].messages;
  expect(secondRequestMessages.some((m) => /ghost-id/.test(m.content))).toBe(true);
});
