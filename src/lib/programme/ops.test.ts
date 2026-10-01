import { describe, it, expect } from 'vitest';
import { EditOpSchema, ProposeEditsInputSchema, proposeEditsJsonSchema } from './ops';

describe('EditOpSchema', () => {
  it('accepts a valid update-exercise op', () => {
    const op = { type: 'update-exercise', exerciseId: 'w1-d1-e2', patch: { sets: 3, load: 'RPE 7' } };
    expect(EditOpSchema.parse(op)).toEqual(op);
  });

  it('rejects an unknown op type', () => {
    expect(EditOpSchema.safeParse({ type: 'explode', exerciseId: 'x' }).success).toBe(false);
  });

  it('rejects add-exercise whose payload smuggles an id', () => {
    const op = {
      type: 'add-exercise', dayId: 'w1-d1',
      exercise: { id: 'w1-d1-e1', name: 'Curl', sets: 3, reps: '10', tracking: 'weighted', restSec: 60 },
    };
    expect(EditOpSchema.safeParse(op).success).toBe(false);
  });

  it('accepts replace-day with payload exercises keeping optional ids', () => {
    const op = {
      type: 'replace-day', dayId: 'w1-d1',
      day: {
        title: 'Day A: Hotel lower',
        exercises: [
          { id: 'w1-d1-e2', name: 'Goblet Squat', sets: 4, reps: '8', tracking: 'weighted', restSec: 120 },
          { name: 'Split Squat', sets: 3, reps: '10/leg', load: 'RPE 7', tracking: 'weighted', restSec: 90 },
        ],
      },
    };
    expect(EditOpSchema.safeParse(op).success).toBe(true);
  });

  it('rejects a day payload with zero exercises', () => {
    const op = { type: 'replace-day', dayId: 'w1-d1', day: { title: 'Empty', exercises: [] } };
    expect(EditOpSchema.safeParse(op).success).toBe(false);
  });

  it('bounds ops batches to 1..50', () => {
    expect(ProposeEditsInputSchema.safeParse({ summary: 'x', ops: [] }).success).toBe(false);
  });

  it('exports a JSON schema object with the 14 op variants', () => {
    const json = proposeEditsJsonSchema() as Record<string, unknown>;
    expect(json).toHaveProperty('properties');
    expect(JSON.stringify(json)).toContain('replace-week');
  });
});
