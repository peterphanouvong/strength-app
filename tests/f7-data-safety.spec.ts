import { test, expect, type Page } from '@playwright/test';
import {
  seedStorage,
  seedStorageOnce,
  seedRawStorage,
  readStorage,
  PROGRESS_KEY,
  SESSION_KEY,
  REST_KEY,
  type SetLog,
} from './helpers/fixtures';

// F7 — data safety (docs/gauntlet/ANSWER_KEY.md).
// Storage contract is frozen:
//   volleyball-workout-progress-v3 : Record<"{exerciseId}-{setIndex}", SetLog>
//   vb-active-session-v1           : { dayId: string, startedAt: number }
//   vb-rest-overrides-v1           : Record<exerciseName, seconds>

const SET_LOG_FIELDS = ['completed', 'weight', 'actualReps', 'timeSec', 'setType'];

/** An exercise's section on the workout page, found by its heading. */
function section(page: Page, name: string | RegExp) {
  return page
    .locator('main section')
    .filter({ has: page.getByRole('heading', { name }) });
}

/** The workout/completion stat value that sits under a given label. */
function statValue(page: Page, label: string) {
  return page.getByText(label, { exact: true }).locator('xpath=following-sibling::p[1]');
}

test.describe('F7 — data safety', () => {
  test('storage keys/shapes exactly match the ground-truth table: seeded fixture round-trips through the UI unchanged apart from user edits', async ({
    page,
  }) => {
    const startedAt = Date.now() - 60_000;
    const seededProgress: Record<string, SetLog> = {
      // every optional field of the frozen shape is represented
      'w1-d1-e1-0': { completed: true, weight: '60', actualReps: '3', setType: 'W' },
      'w1-d1-e1-1': { completed: true, weight: '60', actualReps: '3' },
      'w1-d1-e2-0': { completed: false, weight: '80' }, // ← will be edited (weight → 85)
      'w1-d3-e1-0': { completed: true, timeSec: '4' }, // time-tracked entry, untouched
    };
    const seededRest = { 'Back Squat': 90, 'Bulgarian Split Squat': 0 };
    await seedStorage(page, {
      progress: seededProgress,
      session: { dayId: 'w1-d1', startedAt },
      rest: seededRest,
    });

    await page.goto('/workout/w1-d1');
    await expect(page.getByRole('heading', { name: /Hang Power Clean/ })).toBeVisible();

    // User edits: change one weight, tick one set.
    await section(page, /Back Squat/).locator('input[inputmode="decimal"]').first().fill('85');
    await section(page, /Bulgarian Split Squat/)
      .getByRole('button', { name: 'Mark set complete' })
      .first()
      .click();

    // --- progress key: exact name, keys and value shapes per the table ---
    const progress = await readStorage<Record<string, SetLog>>(page, PROGRESS_KEY);
    expect(progress).not.toBeNull();
    expect(Object.keys(progress!).sort()).toEqual(
      [...Object.keys(seededProgress), 'w1-d1-e3-0'].sort()
    );
    for (const [key, log] of Object.entries(progress!)) {
      expect(key).toMatch(/^w\d+-d\d+-e\d+-\d+$/); // "{exerciseId}-{setIndex}"
      expect(Object.keys(log).every((f) => SET_LOG_FIELDS.includes(f))).toBe(true);
      expect(typeof log.completed).toBe('boolean');
      if (log.weight !== undefined) expect(typeof log.weight).toBe('string');
      if (log.actualReps !== undefined) expect(typeof log.actualReps).toBe('string');
      if (log.timeSec !== undefined) expect(typeof log.timeSec).toBe('string');
      if (log.setType !== undefined) expect(['W', 'F', 'D']).toContain(log.setType);
    }
    // Untouched entries are byte-identical to the seed…
    expect(progress!['w1-d1-e1-0']).toEqual(seededProgress['w1-d1-e1-0']);
    expect(progress!['w1-d1-e1-1']).toEqual(seededProgress['w1-d1-e1-1']);
    expect(progress!['w1-d3-e1-0']).toEqual(seededProgress['w1-d3-e1-0']);
    // …while the edited/ticked ones carry exactly the user edits.
    expect(progress!['w1-d1-e2-0']).toEqual({ completed: false, weight: '85' });
    expect(progress!['w1-d1-e3-0']).toMatchObject({ completed: true });

    // --- session key: same name, exact {dayId, startedAt} shape, untouched ---
    const session = await readStorage<{ dayId: string; startedAt: number }>(page, SESSION_KEY);
    expect(session).toEqual({ dayId: 'w1-d1', startedAt });

    // --- rest key: same name, Record<exerciseName, seconds>, untouched ---
    const rest = await readStorage<Record<string, number>>(page, REST_KEY);
    expect(rest).toEqual(seededRest);
  });

  test('mid-workout reload: tick 5 sets with weights, reload → all 5 ticks, weights, elapsed timer (from original startedAt) and rest overrides intact', async ({
    page,
  }) => {
    const startedAt = Date.now() - 5 * 60_000; // session started ~5 minutes ago
    const seededRest = { 'Hang Power Clean': 0, 'Bulgarian Split Squat': 45 };
    // seedStorageOnce: a reload must NOT re-seed, so the app's own persistence is what we test.
    await seedStorageOnce(page, { session: { dayId: 'w1-d1', startedAt }, rest: seededRest });

    await page.goto('/workout/w1-d1');
    const hpc = section(page, /Hang Power Clean/);
    await expect(hpc.getByRole('heading', { name: /Hang Power Clean/ })).toBeVisible();

    // Tick all 5 Hang Power Clean sets with weights (rest override 0 → no rest bar in the way).
    for (let i = 0; i < 5; i++) {
      await hpc.locator('input[inputmode="decimal"]').nth(i).fill('60');
      await hpc.locator('input[inputmode="numeric"]').nth(i).fill('3');
      await hpc.getByRole('button', { name: 'Mark set complete' }).first().click();
    }
    await expect(hpc.getByRole('button', { name: 'Mark set incomplete' })).toHaveCount(5);

    await page.reload();
    await expect(page.getByRole('heading', { name: /Hang Power Clean/ })).toBeVisible();

    // All 5 ticks and weights intact in the UI…
    await expect(hpc.getByRole('button', { name: 'Mark set incomplete' })).toHaveCount(5);
    for (let i = 0; i < 5; i++) {
      await expect(hpc.locator('input[inputmode="decimal"]').nth(i)).toHaveValue('60');
      await expect(hpc.locator('input[inputmode="numeric"]').nth(i)).toHaveValue('3');
    }
    // …and in storage, in the frozen shape.
    const progress = await readStorage<Record<string, SetLog>>(page, PROGRESS_KEY);
    for (let i = 0; i < 5; i++) {
      expect(progress![`w1-d1-e1-${i}`]).toMatchObject({ completed: true, weight: '60', actualReps: '3' });
    }

    // Elapsed session timer still counts from the ORIGINAL startedAt (~5 min), not from 0.
    const session = await readStorage<{ dayId: string; startedAt: number }>(page, SESSION_KEY);
    expect(session).toEqual({ dayId: 'w1-d1', startedAt });
    const duration = (await statValue(page, 'Duration').innerText()).trim();
    expect(duration).toMatch(/^\d+:\d{2}$/);
    const minutes = Number(duration.split(':')[0]);
    expect(minutes).toBeGreaterThanOrEqual(5);
    expect(minutes).toBeLessThanOrEqual(7);

    // Rest overrides intact — in storage and reflected in the UI.
    const rest = await readStorage<Record<string, number>>(page, REST_KEY);
    expect(rest).toEqual(seededRest);
    await expect(hpc.getByRole('button', { name: 'Rest timer: Off' })).toBeVisible();
    await expect(
      section(page, /Bulgarian Split Squat/).getByRole('button', { name: 'Rest timer: 0:45' })
    ).toBeVisible();
  });

  test('legacy-shaped progress blob (extra unknown fields) does not crash any page; unknown fields on other set entries survive an unrelated set edit', async ({
    page,
  }) => {
    // Legacy entries carrying fields the current app knows nothing about.
    const legacyE1_0 = { completed: true, weight: '60', actualReps: '3', rpe: 8, coachNote: 'from v2' };
    const legacyE1_1 = { completed: true, weight: '62.5', tempo: '2-0-1', flagged: true };
    await seedStorage(page, {
      progress: { 'w1-d1-e1-0': legacyE1_0, 'w1-d1-e1-1': legacyE1_1 } as unknown as Record<string, SetLog>,
      rest: { 'Back Squat': 0 },
    });

    // No page crashes: every route renders real UI.
    await page.goto('/');
    await expect(
      page.getByRole('heading', { name: /Good (morning|afternoon|evening)/ })
    ).toBeVisible();
    await page.goto('/programme');
    await expect(page.getByRole('heading', { name: /12-week/ })).toBeVisible();
    await page.goto('/week/1');
    await expect(page.getByRole('heading', { name: 'Week 1' })).toBeVisible();
    // /complete is the save screen since phase B (spec re-aim from the old congrats layout).
    await page.goto('/complete/w1-d1');
    await expect(page.getByRole('heading', { name: 'Save workout' })).toBeVisible();
    await page.goto('/congrats/w1-d1');
    await expect(page.getByRole('heading', { name: /Nice/ })).toBeVisible();
    await page.goto('/workout/w1-d1');
    await expect(page.getByRole('heading', { name: /Hang Power Clean/ })).toBeVisible();
    // The legacy entries even render as completed sets.
    await expect(
      section(page, /Hang Power Clean/).getByRole('button', { name: 'Mark set incomplete' })
    ).toHaveCount(2);

    // Unrelated edit: tick a Back Squat set (different exercise, different entry).
    await section(page, /Back Squat/).getByRole('button', { name: 'Mark set complete' }).first().click();

    const progress = await readStorage<Record<string, Record<string, unknown>>>(page, PROGRESS_KEY);
    expect(progress!['w1-d1-e2-0']).toMatchObject({ completed: true });
    // Unknown fields on the OTHER entries are fully preserved.
    expect(progress!['w1-d1-e1-0']).toEqual(legacyE1_0);
    expect(progress!['w1-d1-e1-1']).toEqual(legacyE1_1);
  });

  for (const [label, key] of [
    ['progress (volleyball-workout-progress-v3)', PROGRESS_KEY],
    ['session (vb-active-session-v1)', SESSION_KEY],
    ['rest overrides (vb-rest-overrides-v1)', REST_KEY],
  ] as const) {
    test(`corrupt JSON in ${label} → app renders with defaults, no white screen`, async ({ page }) => {
      await seedRawStorage(page, { [key]: '{"oops": not-valid-json,,,' });

      await page.goto('/');
      await expect(
        page.getByRole('heading', { name: /Good (morning|afternoon|evening)/ })
      ).toBeVisible();

      await page.goto('/programme');
      await expect(page.getByRole('heading', { name: /12-week/ })).toBeVisible();

      await page.goto('/week/1');
      await expect(page.getByRole('heading', { name: 'Week 1' })).toBeVisible();

      await page.goto('/workout/w1-d1');
      await expect(page.getByRole('heading', { name: /Hang Power Clean/ })).toBeVisible();
      // Defaults: no progress counted, rest chips shown, page renders in preview.
      await expect(statValue(page, 'Sets')).toHaveText('0/15');
      await expect(
        section(page, /Hang Power Clean/).getByRole('button', { name: /Rest timer:/ })
      ).toBeVisible();

      if (key === SESSION_KEY) {
        // Corrupt session parses to "none" (preview mode); the app recovers by
        // starting a fresh, valid session the moment the user taps Start.
        await page.getByRole('button', { name: 'Start workout' }).click();
        const session = await readStorage<{ dayId: string; startedAt: number }>(page, SESSION_KEY);
        expect(session?.dayId).toBe('w1-d1');
        expect(typeof session?.startedAt).toBe('number');
      }
    });
  }
});
