import { test, expect, type Page } from '@playwright/test';
import { seedStorage, readStorage, PROGRESS_KEY, type SetLog } from './helpers/fixtures';

// F5 — set types (docs/gauntlet/ANSWER_KEY.md).
// Uses Hang Power Clean on /workout/w1-d1 (w1-d1-e1, 5 sets) throughout.
// Set-type letters: W = warm-up (zest), F = failure (flame), D = drop (mist).

/** The exercise section on the workout page whose heading matches `name`. */
function exerciseSection(page: Page, name: string | RegExp) {
  return page
    .locator('main section')
    .filter({ has: page.getByRole('heading', { name }) });
}

/** Tap the set-number button for `setIndex` and pick an option in the type sheet. */
async function chooseSetType(page: Page, section: ReturnType<typeof exerciseSection>, setIndex: number, optionLabel: RegExp) {
  await section.getByRole('button', { name: 'Change set type' }).nth(setIndex).click();
  const sheet = page.getByRole('dialog', { name: 'Select set type' });
  await expect(sheet).toBeVisible();
  await sheet.getByRole('button', { name: optionLabel }).click();
  await expect(sheet).toBeHidden();
}

test.describe('F5 — set types', () => {
  test('tapping a set-number opens the type sheet; choosing W/F/D writes setType into the progress key; choosing Normal removes it', async ({
    page,
  }) => {
    // Browse-first: set-type editing belongs to a live workout, so seed a session.
    await seedStorage(page, { session: { dayId: 'w1-d1', startedAt: Date.now() } });
    await page.goto('/workout/w1-d1');
    await expect(page.getByRole('heading', { name: /Hang Power Clean/ })).toBeVisible();
    const hpc = exerciseSection(page, /Hang Power Clean/);

    // Tapping the set-number opens the type sheet (explicit visibility assert).
    await hpc.getByRole('button', { name: 'Change set type' }).nth(0).click();
    const sheet = page.getByRole('dialog', { name: 'Select set type' });
    await expect(sheet).toBeVisible();
    // All four options offered: W / Normal / F / D.
    await expect(sheet.getByRole('button', { name: /Warm-up set/ })).toBeVisible();
    await expect(sheet.getByRole('button', { name: /Normal set/ })).toBeVisible();
    await expect(sheet.getByRole('button', { name: /Failure set/ })).toBeVisible();
    await expect(sheet.getByRole('button', { name: /Drop set/ })).toBeVisible();
    await sheet.getByRole('button', { name: /Warm-up set/ }).click();
    await expect(sheet).toBeHidden();

    await chooseSetType(page, hpc, 1, /Failure set/);
    await chooseSetType(page, hpc, 2, /Drop set/);

    let progress = await readStorage<Record<string, SetLog>>(page, PROGRESS_KEY);
    expect(progress?.['w1-d1-e1-0']?.setType).toBe('W');
    expect(progress?.['w1-d1-e1-1']?.setType).toBe('F');
    expect(progress?.['w1-d1-e1-2']?.setType).toBe('D');

    // Choosing Normal removes setType from the stored entry (key absent, not just falsy).
    await chooseSetType(page, hpc, 0, /Normal set/);
    progress = await readStorage<Record<string, SetLog>>(page, PROGRESS_KEY);
    expect(progress?.['w1-d1-e1-0']).toBeDefined();
    expect('setType' in (progress?.['w1-d1-e1-0'] ?? {})).toBe(false);
    // Other sets' types untouched.
    expect(progress?.['w1-d1-e1-1']?.setType).toBe('F');
    expect(progress?.['w1-d1-e1-2']?.setType).toBe('D');
  });

  test('the letter (colored) replaces the set number in the row; survives full reload', async ({
    page,
  }) => {
    // Browse-first: set-type editing belongs to a live workout, so seed a session.
    await seedStorage(page, { session: { dayId: 'w1-d1', startedAt: Date.now() } });
    await page.goto('/workout/w1-d1');
    await expect(page.getByRole('heading', { name: /Hang Power Clean/ })).toBeVisible();
    const hpc = exerciseSection(page, /Hang Power Clean/);
    const setButtons = hpc.getByRole('button', { name: 'Change set type' });

    // Before: plain set numbers.
    await expect(setButtons.nth(0)).toHaveText('1');
    await expect(setButtons.nth(1)).toHaveText('2');
    await expect(setButtons.nth(2)).toHaveText('3');

    await chooseSetType(page, hpc, 0, /Warm-up set/);
    await chooseSetType(page, hpc, 1, /Failure set/);
    await chooseSetType(page, hpc, 2, /Drop set/);

    const assertLetters = async () => {
      await expect(setButtons.nth(0)).toHaveText('W');
      await expect(setButtons.nth(0)).toHaveClass(/text-zest/);
      await expect(setButtons.nth(1)).toHaveText('F');
      await expect(setButtons.nth(1)).toHaveClass(/text-flame/);
      await expect(setButtons.nth(2)).toHaveText('D');
      await expect(setButtons.nth(2)).toHaveClass(/text-mist/);
      // Untyped rows keep their set number.
      await expect(setButtons.nth(3)).toHaveText('4');
      await expect(setButtons.nth(4)).toHaveText('5');
    };

    await assertLetters();

    // Survives full reload (persisted, not just component state).
    await page.reload();
    await expect(page.getByRole('heading', { name: /Hang Power Clean/ })).toBeVisible();
    await assertLetters();
  });

  test('completed sets with a type show the letter in the history sheet with matching color class', async ({
    page,
  }) => {
    await seedStorage(page, {
      progress: {
        'w1-d1-e1-0': { completed: true, weight: '60', actualReps: '3', setType: 'W' },
        'w1-d1-e1-1': { completed: true, weight: '60', actualReps: '3', setType: 'F' },
        'w1-d1-e1-2': { completed: true, weight: '60', actualReps: '3', setType: 'D' },
        'w1-d1-e1-3': { completed: true, weight: '60', actualReps: '3' },
        // Incomplete set (even with a type) must not appear in history.
        'w1-d1-e1-4': { completed: false, weight: '60', setType: 'W' },
      },
    });
    await page.goto('/workout/w1-d1');
    await expect(page.getByRole('heading', { name: /Hang Power Clean/ })).toBeVisible();

    await page.getByRole('button', { name: /\d+\.\s*Hang Power Clean/ }).click();
    const sheet = page.getByRole('dialog', { name: 'Hang Power Clean' });
    await expect(sheet).toBeVisible();

    // Only the 4 completed sets are listed.
    await expect(sheet.getByText('60 kg × 3')).toHaveCount(4);

    // Letters shown with the matching color class (W/F/D = zest/flame/mist).
    await expect(sheet.getByText('W', { exact: true })).toHaveClass(/text-zest/);
    await expect(sheet.getByText('F', { exact: true })).toHaveClass(/text-flame/);
    await expect(sheet.getByText('D', { exact: true })).toHaveClass(/text-mist/);
    // Untyped completed set falls back to its position number in the default color.
    await expect(sheet.getByText('4', { exact: true })).toHaveClass(/text-mist/);
  });
});
