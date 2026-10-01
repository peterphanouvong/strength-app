import { describe, it, expect } from 'vitest';
import { applyOps } from './engine';
import { makeTestProgramme } from './testutils';

describe('applyOps — structural ops', () => {
  it('replace-week keeps the week id, renumbers, and respects carried exercise ids', () => {
    const res = applyOps(makeTestProgramme(), [
      {
        type: 'replace-week', weekId: 'w1',
        week: {
          block: '1 — Rebuild', blockNote: 'dumbbell only', focus: 'Perth week', jumpsNote: 'minimal',
          days: [
            {
              id: 'w1-d1', title: 'Day A: Hotel lower',
              exercises: [
                { id: 'w1-d1-e1', name: 'Back Squat', sets: 3, reps: '8', load: 'DB goblet', tracking: 'weighted', restSec: 120 },
                { name: 'DB RDL', sets: 3, reps: '10', tracking: 'weighted', restSec: 90 },
              ],
            },
          ],
        },
      },
    ]);
    if (!res.ok) throw new Error('expected ok');
    const wk = res.programme.weeks[0];
    expect(wk.id).toBe('w1');
    expect(wk.focus).toBe('Perth week');
    expect(wk.days[0].exercises[0].id).toBe('w1-d1-e1'); // identity kept → logs kept
    expect(wk.days[0].exercises[1].id).toMatch(/^ex-/);
    expect(res.programme.weeks[1].weekNumber).toBe(2);
  });

  it('replace-week rejects an id carried from another week', () => {
    const res = applyOps(makeTestProgramme(), [
      {
        type: 'replace-week', weekId: 'w1',
        week: {
          block: 'b', blockNote: '', focus: '', jumpsNote: '',
          days: [{ title: 'D', exercises: [{ id: 'w2-d1-e1', name: 'X', sets: 1, reps: '1', tracking: 'weighted', restSec: 60 }] }],
        },
      },
    ]);
    expect(res.ok).toBe(false);
  });

  it('remove-week renumbers later weeks and warns', () => {
    const res = applyOps(makeTestProgramme(), [{ type: 'remove-week', weekId: 'w1' }]);
    if (!res.ok) throw new Error('expected ok');
    expect(res.programme.weeks).toHaveLength(1);
    expect(res.programme.weeks[0].id).toBe('w2');
    expect(res.programme.weeks[0].weekNumber).toBe(1);
    expect(res.warnings.some((w) => w.code === 'remove-week')).toBe(true);
  });

  it('move-day reorders and renumbers day numbers', () => {
    const res = applyOps(makeTestProgramme(), [{ type: 'move-day', dayId: 'w1-d2', toIndex: 0 }]);
    if (!res.ok) throw new Error('expected ok');
    expect(res.programme.weeks[0].days.map((d) => d.id)).toEqual(['w1-d2', 'w1-d1']);
    expect(res.programme.weeks[0].days[0].day).toBe(1);
  });

  it('append-weeks adds materialised weeks with fresh ids at the end', () => {
    const res = applyOps(makeTestProgramme(), [
      {
        type: 'append-weeks',
        weeks: [{ block: '2 — Load', blockNote: '', focus: 'new', jumpsNote: '', days: [{ title: 'Day A', exercises: [{ name: 'Squat', sets: 3, reps: '5', tracking: 'weighted', restSec: 120 }] }] }],
      },
    ]);
    if (!res.ok) throw new Error('expected ok');
    expect(res.programme.weeks).toHaveLength(3);
    expect(res.programme.weeks[2].weekNumber).toBe(3);
    expect(res.programme.weeks[2].id).toMatch(/^wk-/);
  });
});
