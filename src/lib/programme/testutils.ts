import { Programme } from './types';

export function makeTestProgramme(): Programme {
  return {
    id: 'prog-test', name: 'Test', source: 'seed', createdAt: 1, revision: 0,
    weeks: [
      {
        id: 'w1', weekNumber: 1, block: '1 — Rebuild', blockNote: 'bn', focus: 'f', jumpsNote: 'jn',
        days: [
          {
            id: 'w1-d1', day: 1, title: 'Day A: Lower',
            exercises: [
              { id: 'w1-d1-e1', name: 'Back Squat', sets: 4, reps: '6', load: '70% TM', tracking: 'weighted', restSec: 180 },
              { id: 'w1-d1-e2', name: 'Split Squat', sets: 3, reps: '8/leg', load: 'RPE 7', tracking: 'weighted', restSec: 90 },
            ],
          },
          {
            id: 'w1-d2', day: 2, title: 'Day B: Upper',
            exercises: [
              { id: 'w1-d2-e1', name: 'Bench Press', sets: 4, reps: '6', load: '70% TM', tracking: 'weighted', restSec: 180 },
            ],
          },
        ],
      },
      {
        id: 'w2', weekNumber: 2, block: '1 — Rebuild', blockNote: 'bn', focus: 'f2', jumpsNote: 'jn',
        days: [
          {
            id: 'w2-d1', day: 1, title: 'Day A: Lower',
            exercises: [
              { id: 'w2-d1-e1', name: 'Back Squat', sets: 4, reps: '6', load: '72.5% TM', tracking: 'weighted', restSec: 180 },
            ],
          },
        ],
      },
    ],
  };
}
