import { describe, it, expect } from 'vitest';
import { applyOps } from './engine';
import { EditOp } from './ops';
import { makeTestProgramme } from './testutils';

describe('applyOps — exercise ops', () => {
  it('update-exercise patches fields immutably and bumps revision', () => {
    const p = makeTestProgramme();
    const res = applyOps(p, [{ type: 'update-exercise', exerciseId: 'w1-d1-e1', patch: { sets: 3, load: 'RPE 7' } }]);
    if (!res.ok) throw new Error('expected ok');
    const ex = res.programme.weeks[0].days[0].exercises[0];
    expect(ex.sets).toBe(3);
    expect(ex.load).toBe('RPE 7');
    expect(ex.reps).toBe('6'); // untouched field survives
    expect(res.programme.revision).toBe(1);
    expect(p.weeks[0].days[0].exercises[0].sets).toBe(4); // input not mutated
  });

  it('update-exercise rename warns that history detaches', () => {
    const res = applyOps(makeTestProgramme(), [
      { type: 'update-exercise', exerciseId: 'w1-d1-e1', patch: { name: 'Front Squat' } },
    ]);
    if (!res.ok) throw new Error('expected ok');
    expect(res.warnings.some((w) => w.code === 'rename-detaches-history')).toBe(true);
  });

  it('update-exercise reducing sets below logged indices warns', () => {
    const progress = { 'w1-d1-e1-3': { completed: true } };
    const res = applyOps(
      makeTestProgramme(),
      [{ type: 'update-exercise', exerciseId: 'w1-d1-e1', patch: { sets: 2 } }],
      progress
    );
    if (!res.ok) throw new Error('expected ok');
    expect(res.warnings.some((w) => w.code === 'logged-sets-affected')).toBe(true);
  });

  it('add-exercise assigns a fresh prefixed id at the given index', () => {
    const res = applyOps(makeTestProgramme(), [
      {
        type: 'add-exercise', dayId: 'w1-d1', index: 1,
        exercise: { name: 'Leg Curl', sets: 3, reps: '10', tracking: 'weighted', restSec: 90 },
      },
    ]);
    if (!res.ok) throw new Error('expected ok');
    const exs = res.programme.weeks[0].days[0].exercises;
    expect(exs).toHaveLength(3);
    expect(exs[1].name).toBe('Leg Curl');
    expect(exs[1].id).toMatch(/^ex-[a-z0-9]{8}$/);
  });

  it('remove-exercise with logged sets warns; without, does not', () => {
    const progress = { 'w1-d1-e2-0': { completed: true } };
    const withLogs = applyOps(makeTestProgramme(), [{ type: 'remove-exercise', exerciseId: 'w1-d1-e2' }], progress);
    const without = applyOps(makeTestProgramme(), [{ type: 'remove-exercise', exerciseId: 'w1-d1-e2' }], {});
    if (!withLogs.ok || !without.ok) throw new Error('expected ok');
    expect(withLogs.warnings.some((w) => w.code === 'logged-sets-affected')).toBe(true);
    expect(without.warnings).toHaveLength(0);
  });

  it('remove-exercise refuses to empty a day', () => {
    const res = applyOps(makeTestProgramme(), [{ type: 'remove-exercise', exerciseId: 'w1-d2-e1' }]);
    expect(res.ok).toBe(false);
  });

  it('reorder-exercise clamps toIndex into range', () => {
    const res = applyOps(makeTestProgramme(), [{ type: 'reorder-exercise', exerciseId: 'w1-d1-e1', toIndex: 99 }]);
    if (!res.ok) throw new Error('expected ok');
    expect(res.programme.weeks[0].days[0].exercises[1].id).toBe('w1-d1-e1');
  });

  it('unknown target id fails the WHOLE batch (atomicity)', () => {
    const ops: EditOp[] = [
      { type: 'update-exercise', exerciseId: 'w1-d1-e1', patch: { sets: 1 } },
      { type: 'update-exercise', exerciseId: 'nope', patch: { sets: 1 } },
    ];
    const res = applyOps(makeTestProgramme(), ops);
    expect(res.ok).toBe(false);
    // Note: `=== true` (not bare `res.ok`) because TS's control-flow analysis
    // does not narrow a boolean-literal discriminant on the falsy/else path
    // of a truthiness check — only on strict-equality checks.
    if (res.ok === true) return;
    expect(res.errors[0].opIndex).toBe(1);
  });
});
