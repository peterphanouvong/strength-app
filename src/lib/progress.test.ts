import { describe, it, expect } from 'vitest';
import { removeSetLogAt, ProgressMap } from './progress';

describe('removeSetLogAt', () => {
  const base: ProgressMap = {
    'w1-d1-e2-0': { completed: true, weight: '80', actualReps: '6' },
    'w1-d1-e2-1': { completed: true, weight: '85', actualReps: '6' },
    'w1-d1-e2-2': { completed: true, weight: '90', actualReps: '5' },
    'w1-d1-e2-3': { completed: false, weight: '92' },
    'w1-d1-e1-0': { completed: true, weight: '60' }, // other exercise, untouched
  };

  it('deletes the target row and shifts later rows up by one', () => {
    const next = removeSetLogAt(base, 'w1-d1-e2', 1, 4);
    expect(next['w1-d1-e2-0'].weight).toBe('80');
    expect(next['w1-d1-e2-1'].weight).toBe('90'); // was index 2
    expect(next['w1-d1-e2-2'].weight).toBe('92'); // was index 3
    expect(next['w1-d1-e2-3']).toBeUndefined();
    expect(next['w1-d1-e1-0'].weight).toBe('60');
  });

  it('deleting the last row just drops it', () => {
    const next = removeSetLogAt(base, 'w1-d1-e2', 3, 4);
    expect(next['w1-d1-e2-2'].weight).toBe('90');
    expect(next['w1-d1-e2-3']).toBeUndefined();
  });

  it('handles gaps (un-logged middle sets) without inventing entries', () => {
    const sparse: ProgressMap = {
      'w1-d1-e2-0': { completed: true, weight: '80' },
      'w1-d1-e2-3': { completed: true, weight: '95' },
    };
    const next = removeSetLogAt(sparse, 'w1-d1-e2', 1, 4);
    expect(next['w1-d1-e2-0'].weight).toBe('80');
    expect(next['w1-d1-e2-1']).toBeUndefined();
    expect(next['w1-d1-e2-2'].weight).toBe('95'); // was index 3
    expect(next['w1-d1-e2-3']).toBeUndefined();
  });

  it('does not mutate its input', () => {
    removeSetLogAt(base, 'w1-d1-e2', 0, 4);
    expect(base['w1-d1-e2-0'].weight).toBe('80');
    expect(Object.keys(base)).toHaveLength(5);
  });
});
