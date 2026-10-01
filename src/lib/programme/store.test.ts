// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { TRAINING_PLAN } from '../../data';

async function freshStore() {
  // The store caches module-level state; re-import fresh per test. The cache-bust
  // token must contain no "." — esbuild's loader resolution in this vite-node
  // version derives the loader from the substring after the last dot in the
  // resolved id, so a decimal (e.g. `${Math.random()}`) gets misread as the
  // file extension and the dynamic import fails with "Invalid loader value".
  const mod = await import(`./store?t=${Math.random().toString(36).slice(2)}`);
  return mod as typeof import('./store');
}

beforeEach(() => localStorage.clear());

describe('programme store', () => {
  it('migrates TRAINING_PLAN into vb-programme-v1 on first read, ids intact', async () => {
    const { getProgramme, PROGRAMME_KEY } = await freshStore();
    const p = getProgramme();
    expect(p.source).toBe('seed');
    expect(p.weeks[0].days[0].exercises[0].id).toBe('w1-d1-e1');
    expect(p.weeks).toHaveLength(TRAINING_PLAN.length);
    expect(JSON.parse(localStorage.getItem(PROGRAMME_KEY)!).revision).toBe(0);
  });

  it('re-migrates from seed when the stored value is corrupt', async () => {
    localStorage.setItem('vb-programme-v1', '{"weeks": "lol"}');
    const { getProgramme } = await freshStore();
    expect(getProgramme().weeks[0].id).toBe('w1');
  });

  it('applyEdits persists, bumps revision, and undoLast restores — without touching progress', async () => {
    localStorage.setItem('volleyball-workout-progress-v3', JSON.stringify({ 'w1-d1-e1-0': { completed: true } }));
    const { getProgramme, applyEdits, undoLast, getUndoCount } = await freshStore();
    getProgramme();
    const res = applyEdits([{ type: 'update-exercise', exerciseId: 'w1-d1-e1', patch: { sets: 2 } }]);
    expect(res.ok).toBe(true);
    expect(getProgramme().weeks[0].days[0].exercises[0].sets).toBe(2);
    expect(getProgramme().revision).toBe(1);
    expect(getUndoCount()).toBe(1);
    expect(undoLast()).toBe(true);
    expect(getProgramme().weeks[0].days[0].exercises[0].sets).toBe(5);
    expect(JSON.parse(localStorage.getItem('volleyball-workout-progress-v3')!)['w1-d1-e1-0'].completed).toBe(true);
  });

  it('failed applyEdits changes nothing', async () => {
    const { getProgramme, applyEdits, getUndoCount } = await freshStore();
    const before = getProgramme().revision;
    const res = applyEdits([{ type: 'remove-exercise', exerciseId: 'ghost' }]);
    expect(res.ok).toBe(false);
    expect(getProgramme().revision).toBe(before);
    expect(getUndoCount()).toBe(0);
  });

  it('undo ring buffer caps at 20', async () => {
    const { getProgramme, applyEdits, getUndoCount } = await freshStore();
    getProgramme();
    for (let i = 0; i < 25; i++) {
      applyEdits([{ type: 'update-exercise', exerciseId: 'w1-d1-e1', patch: { restSec: 60 + i } }]);
    }
    expect(getUndoCount()).toBe(20);
  });
});
