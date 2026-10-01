import { describe, it, expect } from 'vitest';
import { describeOps } from './describe';
import { makeTestProgramme } from './testutils';

describe('describeOps', () => {
  it('describes an update-exercise with old → new prescription', () => {
    const [line] = describeOps(
      [{ type: 'update-exercise', exerciseId: 'w1-d1-e1', patch: { sets: 3, reps: '5', load: 'RPE 7' } }],
      makeTestProgramme()
    );
    expect(line).toBe('Week 1, Day A: Back Squat — 4×6 @ 70% TM → 3×5 @ RPE 7');
  });

  it('describes a replace-week with day count', () => {
    const [line] = describeOps(
      [{ type: 'replace-week', weekId: 'w1', week: { block: 'b', blockNote: '', focus: 'Perth', jumpsNote: '', days: [{ title: 'Day A', exercises: [{ name: 'X', sets: 1, reps: '1', tracking: 'weighted', restSec: 60 }] }] } }],
      makeTestProgramme()
    );
    expect(line).toBe('Replaced week 1 (2 days → 1 day): Perth');
  });

  it('falls back gracefully for a missing target', () => {
    const [line] = describeOps([{ type: 'remove-exercise', exerciseId: 'ghost' }], makeTestProgramme());
    expect(line).toContain('ghost');
  });
});
