import { describe, it, expect } from 'vitest';
import { describeOps, describeOpDetails } from './describe';
import { makeTestProgramme } from './testutils';

describe('describeOpDetails', () => {
  it('lists the incoming exercises for a replace-day payload', () => {
    const lines = describeOpDetails({
      type: 'replace-day',
      dayId: 'w1-d1',
      day: {
        title: 'Day C: Pre-comp primer',
        exercises: [
          { name: 'Hang Power Clean', sets: 3, reps: '2', load: '60%', tracking: 'weighted', restSec: 180 },
          { name: 'Pogo Hops', sets: 2, reps: '10', tracking: 'reps', restSec: 60 },
        ],
      },
    });
    expect(lines).toEqual([
      'Day C: Pre-comp primer',
      '  Hang Power Clean — 3×2 @ 60%',
      '  Pogo Hops — 2×10',
    ]);
  });

  it('groups a replace-week payload by day', () => {
    const lines = describeOpDetails({
      type: 'replace-week',
      weekId: 'w1',
      week: {
        block: 'b',
        blockNote: '',
        focus: 'Perth week',
        jumpsNote: '',
        days: [
          {
            title: 'Day A: Hotel lower',
            exercises: [{ name: 'Goblet Squat', sets: 4, reps: '8', load: 'DB', tracking: 'weighted', restSec: 120 }],
          },
          {
            title: 'Day B: Hotel upper',
            exercises: [{ name: 'Push-Ups', sets: 3, reps: '15', tracking: 'reps', restSec: 60 }],
          },
        ],
      },
    });
    expect(lines).toEqual([
      'Day A: Hotel lower',
      '  Goblet Squat — 4×8 @ DB',
      'Day B: Hotel upper',
      '  Push-Ups — 3×15',
    ]);
  });

  it('lists exercises for an add-day payload', () => {
    const lines = describeOpDetails({
      type: 'add-day',
      weekId: 'w1',
      day: {
        title: 'Day E: Extra arms',
        exercises: [{ name: 'Curl', sets: 3, reps: '10', tracking: 'weighted', restSec: 60 }],
      },
    });
    expect(lines).toEqual(['Day E: Extra arms', '  Curl — 3×10']);
  });

  it('returns no detail lines for ops without payloads', () => {
    expect(describeOpDetails({ type: 'remove-exercise', exerciseId: 'x' })).toEqual([]);
  });
});

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
