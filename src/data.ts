export type Tracking = 'weighted' | 'reps' | 'time';

export type Exercise = {
  id: string;
  name: string;
  sets: number;
  reps: string; // e.g., "3", "6-8", "8/leg", "20 m"
  load?: string; // e.g., "70% TM", "RPE 7", "Bodyweight"
  notes?: string;
  tracking: Tracking; // what gets logged per set
  restSec: number; // suggested rest between sets
};

export type WorkoutDay = {
  id: string;
  day: number;
  title: string;
  exercises: Exercise[];
};

export type WeekPlan = {
  id: string;
  weekNumber: number;
  block: string;
  blockNote: string;
  focus: string;
  jumpsNote: string;
  days: WorkoutDay[];
};

type Rx = { sets: number; reps: string; load: string; notes?: string };

// Weekly progression for the main lifts (back squat, bench press, overhead press).
const MAIN_LIFT: Record<number, Rx> = {
  1: { sets: 4, reps: '6', load: '70% TM' },
  2: { sets: 4, reps: '6', load: '72.5% TM' },
  3: { sets: 5, reps: '6', load: '75% TM' },
  4: { sets: 3, reps: '5', load: '65% TM' },
  5: { sets: 5, reps: '3', load: '82% TM' },
  6: { sets: 5, reps: '3', load: '85% TM' },
  7: { sets: 4, reps: '3', load: '87% TM', notes: 'Plus 1 top single @ 90% — a gauge, not a max attempt' },
  8: { sets: 3, reps: '3', load: '70% TM' },
  9: { sets: 4, reps: '3', load: '78% TM' },
  10: { sets: 4, reps: '3', load: '80% TM' },
  11: { sets: 3, reps: '3', load: '80% TM' },
  12: { sets: 2, reps: '3', load: '70% TM' },
};

// Weekly progression for the cleans. In Block 3 this governs the Day C power
// clean singles; the Day A hang power clean keeps its own prescription.
const CLEAN: Record<number, Rx> = {
  1: { sets: 5, reps: '3', load: '60%' },
  2: { sets: 5, reps: '3', load: '65%' },
  3: { sets: 5, reps: '3', load: '70%' },
  4: { sets: 3, reps: '3', load: '60%' },
  5: { sets: 5, reps: '2', load: '78%' },
  6: { sets: 5, reps: '2', load: '82%' },
  7: { sets: 4, reps: '2', load: '85%' },
  8: { sets: 3, reps: '2', load: '65%' },
  9: { sets: 5, reps: '1', load: '85%' },
  10: { sets: 5, reps: '1', load: '88%' },
  11: { sets: 4, reps: '1', load: '90%' },
  12: { sets: 3, reps: '1', load: '80%' },
};

const WEEK_FOCUS: Record<number, string> = {
  1: 'Establish TMs. Keep it easy.',
  2: 'Main lifts up to 72.5%, cleans to 65%. Still leaving something in the tank.',
  3: 'Hardest week of the block — 5 × 6 on the main lifts at 75%.',
  4: 'Deload — main lifts 3 × 5 @ 65%, cleans 3 × 3 @ 60%, accessories cut to 2 sets.',
  5: "New TMs from Week 1 gains. Trap bar and med ball introduced — go conservative on the first trap bar session, it'll feel deceptively easy and leave you sore.",
  6: 'Trap bar up ~5%. Med ball throws stay 4 × 5 all block — quality, not volume.',
  7: 'Peak week — main lifts 4 × 3 @ 87% plus one top single @ 90%. The single is a gauge, not a max attempt.',
  8: 'Deload. Optional: test squat/bench 3RM on the Thursday.',
  9: 'Recalculate TMs. Every rep moved with maximal intent.',
  10: 'Highest jump-quality week.',
  11: 'Volume drops, intent stays.',
  12: 'Taper. Days A and B only, plus 10–15 jumps. Nothing within 48 h of competition.',
};

const BLOCK_NOTES: Record<string, string> = {
  '1 — Rebuild':
    "Volume-led. Loads should feel like you're leaving something in the tank every session. The point is to reintroduce your joints and tendons to load, not to test yourself.",
  '2 — Load':
    'Sets get heavier and shorter. Rest 3 min on main lifts — this is the block where rushing costs you the adaptation. Recalculate TMs before Week 5.',
  '3 — Convert':
    'Strength is banked. Now the job is speed. Every rep is moved with maximal intent — the load is submaximal so that the bar or your body moves fast. Volume drops sharply so you arrive at competition fresh, not flattened.',
};

const JUMPS_NOTES: Record<string, string> = {
  '1 — Rebuild':
    'Jumps & sprints: 40–60 foot contacts per session on Days A and C. Box jumps 3 × 3 (step down, never jump down), pogo hops, low hurdle hops. Sprint volume caps at 120–160 m per session.',
  '2 — Load':
    'Jumps & sprints: 60–80 contacts. Add approach jumps (3 × 4 full approach, max reach), hurdle hops, depth jump to a box from 30 cm. Sprints rise to 150–200 m per session.',
  '3 — Convert':
    "Jumps & sprints: quality over quantity — 40 contacts max, all of them maximal. If a jump feels flat, the session's jumping is over. Sprints drop to 100–120 m.",
};

export const IN_SEASON_ADJUSTMENTS: { title: string; body: string }[] = [
  {
    title: 'Court day the same day as lifting?',
    body: 'Lift after practice, or at least 6 hours apart. Cut to the first two exercises.',
  },
  {
    title: 'Match tomorrow?',
    body: "Skip Day C's sprints and depth jumps entirely. Lower-body plyos are the first thing to go.",
  },
  {
    title: 'Legs heavy, jumps feel dead?',
    body: 'Drop main-lift percentages by 10% for that session. Rebuilding a jump takes a week; overreaching costs a month.',
  },
  {
    title: 'Missed a week?',
    body: 'Repeat the last week you completed rather than jumping ahead. The block order matters more than hitting Week 12 on schedule.',
  },
];

const ex = (
  week: number,
  day: number,
  n: number,
  e: Omit<Exercise, 'id' | 'tracking' | 'restSec'> & Partial<Pick<Exercise, 'tracking' | 'restSec'>>
): Exercise => ({
  id: `w${week}-d${day}-e${n}`,
  tracking: 'weighted',
  restSec: 90,
  ...e,
});

const buildBlock1Days = (w: number): WorkoutDay[] => {
  const main = MAIN_LIFT[w];
  const clean = CLEAN[w];
  const acc = w === 4 ? 2 : 3; // deload: cut accessories to 2 sets
  return [
    {
      id: `w${w}-d1`,
      day: 1,
      title: 'Day A: Lower Strength',
      exercises: [
        ex(w, 1, 1, { name: 'Hang Power Clean', sets: clean.sets, reps: clean.reps, load: clean.load, restSec: 180, notes: 'From mid-thigh' }),
        ex(w, 1, 2, { name: 'Back Squat', sets: main.sets, reps: main.reps, load: main.load, restSec: 180, notes: main.notes }),
        ex(w, 1, 3, { name: 'Bulgarian Split Squat', sets: acc, reps: '8/leg', load: 'RPE 7', notes: 'Dumbbells' }),
        ex(w, 1, 4, { name: 'Hanging Knee Raise', sets: acc, reps: '10', load: 'Bodyweight', tracking: 'reps', restSec: 60 }),
      ],
    },
    {
      id: `w${w}-d2`,
      day: 2,
      title: 'Day B: Upper Push',
      exercises: [
        ex(w, 2, 1, { name: 'Bench Press', sets: main.sets, reps: main.reps, load: main.load, restSec: 180, notes: main.notes }),
        ex(w, 2, 2, { name: 'Pull-Ups', sets: 4, reps: '6-8', load: 'Bodyweight', tracking: 'reps', restSec: 90, notes: 'Add load if easy' }),
        ex(w, 2, 3, { name: 'DB Incline Press', sets: acc, reps: '10', load: 'RPE 7' }),
        ex(w, 2, 4, { name: 'DB Row', sets: acc, reps: '10/arm', load: 'RPE 7' }),
      ],
    },
    {
      id: `w${w}-d3`,
      day: 3,
      title: 'Day C: Lower Power + Sprints',
      exercises: [
        ex(w, 3, 1, { name: 'Sprints', sets: 6, reps: '20 m', load: '~90% effort', tracking: 'time', restSec: 120, notes: 'Walk back rest' }),
        ex(w, 3, 2, { name: 'Power Clean', sets: clean.sets, reps: clean.reps, load: clean.load, restSec: 180, notes: 'From the floor' }),
        ex(w, 3, 3, { name: 'Front Squat', sets: 3, reps: '5', load: '65-70% TM', restSec: 150 }),
        ex(w, 3, 4, { name: 'DB Romanian Deadlift', sets: acc, reps: '8', load: 'RPE 7' }),
      ],
    },
    {
      id: `w${w}-d4`,
      day: 4,
      title: 'Day D: Upper Pull + Overhead',
      exercises: [
        ex(w, 4, 1, { name: 'Overhead Press', sets: main.sets, reps: main.reps, load: main.load, restSec: 180, notes: main.notes }),
        ex(w, 4, 2, { name: 'Pull-Ups', sets: 4, reps: 'Max-2', load: 'Bodyweight', tracking: 'reps', restSec: 90, notes: 'Stop 2 short of failure' }),
        ex(w, 4, 3, { name: 'Push-Ups', sets: acc, reps: '15-20', load: 'Bodyweight', tracking: 'reps', restSec: 60, notes: 'Tempo 2-0-1' }),
        ex(w, 4, 4, { name: 'DB External Rotation + Y-Raise', sets: acc, reps: '12', load: 'Light' }),
      ],
    },
  ];
};

const buildBlock2Days = (w: number): WorkoutDay[] => {
  const main = MAIN_LIFT[w];
  const clean = CLEAN[w];
  return [
    {
      id: `w${w}-d1`,
      day: 1,
      title: 'Day A: Lower Strength',
      exercises: [
        ex(w, 1, 1, { name: 'Hang Power Clean', sets: clean.sets, reps: clean.reps, load: clean.load, restSec: 180 }),
        ex(w, 1, 2, { name: 'Back Squat', sets: main.sets, reps: main.reps, load: main.load, restSec: 180, notes: main.notes }),
        ex(w, 1, 3, { name: 'Trap Bar Deadlift', sets: 3, reps: '5', load: 'RPE 8', restSec: 180, notes: 'Handles high, hips a touch lower than a conventional pull. Loads the posterior chain without stacking spinal fatigue on the squat.' }),
        ex(w, 1, 4, { name: 'Ab Wheel or Hollow Hold', sets: 3, reps: '8 / 30 s', tracking: 'reps', restSec: 60 }),
      ],
    },
    {
      id: `w${w}-d2`,
      day: 2,
      title: 'Day B: Upper Push',
      exercises: [
        ex(w, 2, 1, { name: 'Med Ball Overhead Throw', sets: 4, reps: '5', load: '3-4 kg', tracking: 'reps', restSec: 120, notes: 'Max effort — ball behind the head, whole body into it, throw for distance. Goes first: power needs a fresh nervous system, and it primes the bench.' }),
        ex(w, 2, 2, { name: 'Bench Press', sets: main.sets, reps: main.reps, load: main.load, restSec: 180, notes: main.notes }),
        ex(w, 2, 3, { name: 'Weighted Pull-Up', sets: 4, reps: '4', load: 'RPE 8', restSec: 120 }),
        ex(w, 2, 4, { name: 'DB Row', sets: 3, reps: '8/arm', load: 'Heavy' }),
      ],
    },
    {
      id: `w${w}-d3`,
      day: 3,
      title: 'Day C: Lower Power + Sprints',
      exercises: [
        ex(w, 3, 1, { name: 'Sprints', sets: 5, reps: '30 m', load: 'Max effort', tracking: 'time', restSec: 150, notes: '2-3 min rest' }),
        ex(w, 3, 2, { name: 'Power Clean', sets: clean.sets, reps: clean.reps, load: clean.load, restSec: 180 }),
        ex(w, 3, 3, { name: 'Front Squat', sets: 4, reps: '3', load: '80% TM', restSec: 180 }),
        ex(w, 3, 4, { name: 'Nordic Curl or Barbell Hip Thrust', sets: 3, reps: '6', load: 'RPE 8', restSec: 120 }),
      ],
    },
    {
      id: `w${w}-d4`,
      day: 4,
      title: 'Day D: Upper Pull + Overhead',
      exercises: [
        ex(w, 4, 1, { name: 'Overhead Press', sets: main.sets, reps: main.reps, load: main.load, restSec: 180, notes: main.notes }),
        ex(w, 4, 2, { name: 'Weighted Pull-Up', sets: 4, reps: '5', load: 'RPE 8', restSec: 120 }),
        ex(w, 4, 3, { name: 'Push-Up, Feet Elevated', sets: 3, reps: '12', load: 'Bodyweight', tracking: 'reps', restSec: 90, notes: 'Explosive up' }),
        ex(w, 4, 4, { name: 'Face Pull + External Rotation', sets: 3, reps: '15', load: 'Light' }),
      ],
    },
  ];
};

const buildBlock3Days = (w: number): WorkoutDay[] => {
  const main = MAIN_LIFT[w];
  const clean = CLEAN[w];
  const taper = w === 12;

  const dayA: WorkoutDay = {
    id: `w${w}-d1`,
    day: 1,
    title: 'Day A: Lower Power (Contrast)',
    exercises: [
      taper
        ? ex(w, 1, 1, { name: 'Hang Power Clean', sets: clean.sets, reps: clean.reps, load: clean.load, restSec: 180, notes: 'Fast' })
        : ex(w, 1, 1, { name: 'Hang Power Clean', sets: 5, reps: '2', load: '80-85%', notes: 'Fast' }),
      ex(w, 1, 2, { name: 'Back Squat', sets: main.sets, reps: main.reps, load: main.load, restSec: 180, notes: 'Explosive concentric' }),
      ex(w, 1, 3, {
        name: 'Trap Bar Jump',
        restSec: 120,
        sets: taper ? 2 : 5,
        reps: '3',
        load: taper ? 'Light' : '20-30% of trap bar DL',
        notes: 'Jump for max height, step down and reset every rep. Never bounce reps, never jump down with the bar. If height drops off, the set is done.',
      }),
      ex(w, 1, 4, { name: 'Copenhagen Plank', sets: 2, reps: '20 s/side', tracking: 'time', restSec: 60 }),
    ],
  };

  const dayB: WorkoutDay = {
    id: `w${w}-d2`,
    day: 2,
    title: 'Day B: Upper Push (Speed)',
    exercises: [
      ex(w, 2, 1, { name: 'Bench Press', sets: main.sets, reps: main.reps, load: main.load, restSec: 180, notes: 'Max bar speed' }),
      ex(w, 2, 2, { name: 'Med Ball Overhead Throw', sets: taper ? 3 : 4, reps: '5', load: '3-4 kg', tracking: 'reps', restSec: 120, notes: 'Or chest pass — max effort' }),
      ex(w, 2, 3, { name: 'Weighted Pull-Up', sets: taper ? 3 : 4, reps: '4', load: 'RPE 7-8', restSec: 120 }),
      ex(w, 2, 4, { name: 'DB Row', sets: taper ? 2 : 3, reps: '8/arm', load: 'Moderate' }),
    ],
  };

  if (taper) {
    // Week 12: Days A and B only, plus 10-15 jumps.
    return [dayA, dayB];
  }

  return [
    dayA,
    dayB,
    {
      id: `w${w}-d3`,
      day: 3,
      title: 'Day C: Jump + Sprint',
      exercises: [
        ex(w, 3, 1, { name: 'Sprints', sets: 4, reps: '25 m', load: 'Max effort', tracking: 'time', restSec: 180, notes: 'Full recovery' }),
        ex(w, 3, 2, { name: 'Power Clean', sets: clean.sets, reps: clean.reps, load: clean.load, restSec: 180, notes: 'Crisp reps only' }),
        ex(w, 3, 3, { name: 'Depth Jump to Approach Jump', sets: 4, reps: '3', load: 'Bodyweight', tracking: 'reps', restSec: 120, notes: '30-40 cm box into a max approach jump' }),
        ex(w, 3, 4, { name: 'Front Squat', sets: 3, reps: '3', load: '75% TM', restSec: 150, notes: 'Fast' }),
      ],
    },
    {
      id: `w${w}-d4`,
      day: 4,
      title: 'Day D: Upper Pull + Shoulder Health',
      exercises: [
        ex(w, 4, 1, { name: 'Overhead Press', sets: main.sets, reps: main.reps, load: main.load }),
        ex(w, 4, 2, { name: 'Pull-Ups', sets: 3, reps: '6', load: 'Bodyweight', tracking: 'reps', restSec: 90 }),
        ex(w, 4, 3, { name: 'Push-Ups', sets: 3, reps: '12', load: 'Bodyweight', tracking: 'reps', restSec: 60, notes: 'Explosive' }),
        ex(w, 4, 4, { name: 'Band External Rotation, Y-T-W, Scap Work', sets: 3, reps: '12', load: 'Light', tracking: 'reps', restSec: 60 }),
      ],
    },
  ];
};

export const TRAINING_PLAN: WeekPlan[] = Array.from({ length: 12 }).map((_, weekIndex) => {
  const weekNumber = weekIndex + 1;

  let block: string;
  let days: WorkoutDay[];
  if (weekNumber <= 4) {
    block = '1 — Rebuild';
    days = buildBlock1Days(weekNumber);
  } else if (weekNumber <= 8) {
    block = '2 — Load';
    days = buildBlock2Days(weekNumber);
  } else {
    block = '3 — Convert';
    days = buildBlock3Days(weekNumber);
  }

  return {
    id: `w${weekNumber}`,
    weekNumber,
    block,
    blockNote: BLOCK_NOTES[block],
    focus: WEEK_FOCUS[weekNumber],
    jumpsNote: JUMPS_NOTES[block],
    days,
  };
});
