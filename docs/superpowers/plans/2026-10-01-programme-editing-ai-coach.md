# Programme Editing Engine + AI Coach Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make the training programme user-owned, editable data — mutated only through a typed-ops engine — with a light manual edit UI and an AI coach (Supabase edge function + chat screen) that proposes edits the user applies with one tap.

**Architecture:** The hardcoded `TRAINING_PLAN` is forked once into localStorage (`vb-programme-v1`) with ids intact. A pure engine (`applyOps`) is the single mutation path; Zod schemas validate ops and double as the Claude tool JSON schema. The manual UI and the AI chat are two clients of the same ops. The edge function holds the Anthropic key; phase A access is a bearer secret.

**Tech Stack:** React 19, Vite 6, Tailwind 4, react-router 7, motion, zod 4, Vitest (new), Playwright (existing), Supabase Edge Functions (Deno), `@anthropic-ai/sdk` (claude-sonnet-5).

**Spec:** `docs/superpowers/specs/2026-10-01-programme-editing-ai-coach-design.md`

## Global Constraints

- Ids are permanent handles, never renumbered: set logs key `${exerciseId}-${setIndex}`, discard logic matches `key.startsWith(dayId + '-')`. `weekNumber` and `day.day` are display ordering, recomputed from array position.
- `src/data.ts` is frozen — never modify it; it remains the seed template.
- Exercise history and PRs match by exercise **name** (unchanged behaviour); renaming detaches history and must warn.
- All UI copy is sentence case — no letterspaced uppercase, no Title Case labels.
- Colours only via theme tokens (`bg-primary`, `text-secondary`, `bg-ink/10`, …) — never raw hex in components.
- Haptics on taps (`hapticTap`) and selections (`hapticSelect`) like neighbouring code.
- New deps: `zod@^4` (dependency), `vitest` + `happy-dom` (dev). No other additions.
- Model: `claude-sonnet-5` (per approved spec). The Anthropic key lives ONLY in Supabase secrets, never in client code or the repo.
- `npm run lint` (`tsc --noEmit`) must pass after every task.
- Commit after every task with a conventional-commits message.

## Review Focus

Spec-implied failure modes not obvious from the happy path — each line's test is added to the owning task:

1. **Corrupt `vb-programme-v1`** (hand-edited, truncated, old shape) must re-migrate from seed, never white-screen → Task 4 (store coerce test).
2. **AI ops referencing stale ids** (programme edited between proposal and apply) must reject the whole batch atomically, apply nothing → Task 2 (atomicity test) + Task 10 (apply-failure card).
3. **Payload-carried duplicate ids** (`replace-week` carrying another week's exercise id) must be rejected, or set logs would collide → Task 3 (global-uniqueness test).
4. **Reducing `sets` below logged indices** must warn and leave orphan log keys harmless (progress derivation iterates `ex.sets`, extra keys ignored) → Task 2 (warning test).
5. **Missing/wrong bearer token** must return 401 from the edge function and surface a re-enter-token prompt in chat, never a silent failure → Task 8 (function auth) + Task 10 (401 path).

---

### Task 1: Vitest setup + Programme/Profile types + op schemas

**Files:**
- Create: `vitest.config.ts`
- Create: `src/lib/programme/types.ts`
- Create: `src/lib/programme/ops.ts`
- Test: `src/lib/programme/ops.test.ts`
- Modify: `package.json` (deps + `test:unit` script)

**Interfaces:**
- Produces: `Programme`, `Profile`, `ProgrammeSource` types; `EditOp` union type; `EditOpSchema`, `EditOpsSchema`, `ProposeEditsInputSchema` Zod schemas; `proposeEditsJsonSchema()`; payload schemas `ExercisePayloadSchema`, `DayPayloadSchema`, `WeekPayloadSchema`. Later tasks import all of these from `../lib/programme/{types,ops}`.

- [ ] **Step 1: Install deps**

```bash
npm install zod && npm install -D vitest happy-dom
```

- [ ] **Step 2: Add vitest config and script**

Create `vitest.config.ts` (standalone — deliberately NOT importing `vite.config.ts`, whose PWA/tailwind plugins would slow and break node-env tests):

```ts
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['src/**/*.test.ts'],
    environment: 'node',
  },
});
```

In `package.json` scripts add: `"test:unit": "vitest run"`.

- [ ] **Step 3: Write the failing test**

Create `src/lib/programme/ops.test.ts`:

```ts
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
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run src/lib/programme/ops.test.ts`
Expected: FAIL — cannot resolve `./ops`.

- [ ] **Step 5: Implement types and schemas**

Create `src/lib/programme/types.ts`:

```ts
import { WeekPlan } from '../../data';

export type ProgrammeSource = 'seed' | 'ai' | 'custom';

export type Programme = {
  id: string;
  name: string;
  source: ProgrammeSource;
  createdAt: number;
  revision: number; // bumped on every applied op batch
  weeks: WeekPlan[];
};

export type Profile = {
  goals: string;
  sportContext?: string;
  equipment: string[];
  daysPerWeek: number;
  experience: 'beginner' | 'intermediate' | 'advanced';
};
```

Create `src/lib/programme/ops.ts`. IMPORTANT: this module must stay dependency-light (zod only, no React, no localStorage) — the Supabase edge function imports it too.

```ts
import { z } from 'zod';

export const TrackingSchema = z.enum(['weighted', 'reps', 'time']);

// Payload exercises may carry an optional id — present means "this is an
// existing exercise keeping its identity (and its set logs)".
export const ExercisePayloadSchema = z.object({
  id: z.string().min(1).optional(),
  name: z.string().min(1),
  sets: z.number().int().min(1).max(20),
  reps: z.string().min(1),
  load: z.string().optional(),
  notes: z.string().optional(),
  tracking: TrackingSchema,
  restSec: z.number().int().min(0).max(900),
});

export const DayPayloadSchema = z.object({
  id: z.string().min(1).optional(),
  title: z.string().min(1),
  exercises: z.array(ExercisePayloadSchema).min(1).max(12),
});

export const WeekPayloadSchema = z.object({
  block: z.string().min(1),
  blockNote: z.string(),
  focus: z.string(),
  jumpsNote: z.string(),
  days: z.array(DayPayloadSchema).min(1).max(7),
});

const ExercisePatchSchema = z.object({
  name: z.string().min(1).optional(),
  sets: z.number().int().min(1).max(20).optional(),
  reps: z.string().min(1).optional(),
  load: z.string().optional(),
  notes: z.string().optional(),
  tracking: TrackingSchema.optional(),
  restSec: z.number().int().min(0).max(900).optional(),
});

export const EditOpSchema = z.discriminatedUnion('type', [
  z.object({ type: z.literal('update-exercise'), exerciseId: z.string(), patch: ExercisePatchSchema }),
  z.object({
    type: z.literal('add-exercise'),
    dayId: z.string(),
    index: z.number().int().min(0).optional(),
    exercise: ExercisePayloadSchema.omit({ id: true }),
  }),
  z.object({ type: z.literal('remove-exercise'), exerciseId: z.string() }),
  z.object({ type: z.literal('reorder-exercise'), exerciseId: z.string(), toIndex: z.number().int().min(0) }),
  z.object({ type: z.literal('update-day'), dayId: z.string(), patch: z.object({ title: z.string().min(1) }) }),
  z.object({ type: z.literal('replace-day'), dayId: z.string(), day: DayPayloadSchema }),
  z.object({
    type: z.literal('add-day'),
    weekId: z.string(),
    index: z.number().int().min(0).optional(),
    day: DayPayloadSchema.omit({ id: true }),
  }),
  z.object({ type: z.literal('remove-day'), dayId: z.string() }),
  z.object({ type: z.literal('move-day'), dayId: z.string(), toIndex: z.number().int().min(0) }),
  z.object({
    type: z.literal('update-week'),
    weekId: z.string(),
    patch: z.object({
      block: z.string().min(1).optional(),
      blockNote: z.string().optional(),
      focus: z.string().optional(),
      jumpsNote: z.string().optional(),
    }),
  }),
  z.object({ type: z.literal('replace-week'), weekId: z.string(), week: WeekPayloadSchema }),
  z.object({ type: z.literal('remove-week'), weekId: z.string() }),
  z.object({ type: z.literal('update-programme'), patch: z.object({ name: z.string().min(1) }) }),
  z.object({ type: z.literal('append-weeks'), weeks: z.array(WeekPayloadSchema).min(1).max(16) }),
]);

export type EditOp = z.infer<typeof EditOpSchema>;

export const EditOpsSchema = z.array(EditOpSchema).min(1).max(50);

export const ProposeEditsInputSchema = z.object({
  summary: z.string().min(1).max(500),
  ops: EditOpsSchema,
});
export type ProposeEditsInput = z.infer<typeof ProposeEditsInputSchema>;

/** JSON Schema for the Claude `propose_edits` tool — generated from the same source of truth. */
export function proposeEditsJsonSchema(): Record<string, unknown> {
  return z.toJSONSchema(ProposeEditsInputSchema) as Record<string, unknown>;
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run src/lib/programme/ops.test.ts` — expected PASS — and `npm run lint`.

- [ ] **Step 7: Commit**

```bash
git add vitest.config.ts src/lib/programme/ package.json package-lock.json
git commit -m "feat: programme types and edit-op zod schemas, vitest setup"
```

---

### Task 2: Engine — exercise-level ops, atomicity, warnings

**Files:**
- Create: `src/lib/programme/engine.ts`
- Test: `src/lib/programme/engine.test.ts`

**Interfaces:**
- Consumes: `EditOp` from `./ops`; `Programme` from `./types`; `ProgressMap` from `../progress`.
- Produces:
  - `applyOps(programme: Programme, ops: EditOp[], progress?: ProgressMap): ApplyResult`
  - `type ApplyResult = { ok: true; programme: Programme; warnings: Warning[] } | { ok: false; errors: OpError[] }`
  - `type Warning = { code: 'rename-detaches-history' | 'logged-sets-affected' | 'remove-week'; message: string }`
  - `type OpError = { opIndex: number; message: string }`
  - `makeTestProgramme()` test helper exported from the test file for reuse in later test files.

- [ ] **Step 1: Write the failing tests**

Create `src/lib/programme/engine.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { applyOps } from './engine';
import { Programme } from './types';
import { EditOp } from './ops';

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
    if (res.ok) return;
    expect(res.errors[0].opIndex).toBe(1);
  });
});
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `npx vitest run src/lib/programme/engine.test.ts`
Expected: FAIL — cannot resolve `./engine`.

- [ ] **Step 3: Implement the engine**

Create `src/lib/programme/engine.ts`:

```ts
// The single mutation path for programmes. Pure and immutable: applyOps never
// touches storage and never mutates its input — the store (store.ts) owns
// persistence, undo, and notification. Batches are atomic: the first invalid
// op fails the whole batch.

import { Exercise, WorkoutDay, WeekPlan } from '../../data';
import { ProgressMap } from '../progress';
import { Programme } from './types';
import { EditOp } from './ops';
import type { z } from 'zod';
import { DayPayloadSchema, ExercisePayloadSchema, WeekPayloadSchema } from './ops';

export type Warning = {
  code: 'rename-detaches-history' | 'logged-sets-affected' | 'remove-week';
  message: string;
};
export type OpError = { opIndex: number; message: string };
export type ApplyResult =
  | { ok: true; programme: Programme; warnings: Warning[] }
  | { ok: false; errors: OpError[] };

type ExercisePayload = z.infer<typeof ExercisePayloadSchema>;
type DayPayload = z.infer<typeof DayPayloadSchema>;
type WeekPayload = z.infer<typeof WeekPayloadSchema>;

const ID_ALPHABET = 'abcdefghijklmnopqrstuvwxyz0123456789';

function genId(prefix: 'ex' | 'day' | 'wk', taken: Set<string>): string {
  for (;;) {
    let suffix = '';
    for (let i = 0; i < 8; i++) suffix += ID_ALPHABET[Math.floor(Math.random() * ID_ALPHABET.length)];
    const id = `${prefix}-${suffix}`;
    if (!taken.has(id)) {
      taken.add(id);
      return id;
    }
  }
}

function allIds(weeks: WeekPlan[]): Set<string> {
  const ids = new Set<string>();
  for (const w of weeks) {
    ids.add(w.id);
    for (const d of w.days) {
      ids.add(d.id);
      for (const e of d.exercises) ids.add(e.id);
    }
  }
  return ids;
}

/** Any completed/logged entry for this exercise id in the progress map? */
function hasLogs(progress: ProgressMap, exerciseId: string): boolean {
  return Object.keys(progress).some((k) => k.startsWith(`${exerciseId}-`));
}

function dayHasLogs(progress: ProgressMap, day: WorkoutDay): boolean {
  return day.exercises.some((e) => hasLogs(progress, e.id));
}

/** Recompute display ordering after structural changes. Ids never change. */
function renumber(weeks: WeekPlan[]): WeekPlan[] {
  return weeks.map((w, wi) => ({
    ...w,
    weekNumber: wi + 1,
    days: w.days.map((d, di) => ({ ...d, day: di + 1 })),
  }));
}

function materialiseExercise(p: ExercisePayload, taken: Set<string>): Exercise {
  return {
    id: p.id ?? genId('ex', taken),
    name: p.name,
    sets: p.sets,
    reps: p.reps,
    load: p.load,
    notes: p.notes,
    tracking: p.tracking,
    restSec: p.restSec,
  };
}

function materialiseDay(p: DayPayload, taken: Set<string>): WorkoutDay {
  return {
    id: p.id ?? genId('day', taken),
    day: 0, // renumbered below
    title: p.title,
    exercises: p.exercises.map((e) => materialiseExercise(e, taken)),
  };
}

function materialiseWeek(p: WeekPayload, taken: Set<string>): WeekPlan {
  return {
    id: genId('wk', taken),
    weekNumber: 0, // renumbered below
    block: p.block,
    blockNote: p.blockNote,
    focus: p.focus,
    jumpsNote: p.jumpsNote,
    days: p.days.map((d) => materialiseDay(d, taken)),
  };
}

type Located = { weekIndex: number; dayIndex: number; exerciseIndex: number };

function locateExercise(weeks: WeekPlan[], exerciseId: string): Located | null {
  for (let wi = 0; wi < weeks.length; wi++)
    for (let di = 0; di < weeks[wi].days.length; di++) {
      const ei = weeks[wi].days[di].exercises.findIndex((e) => e.id === exerciseId);
      if (ei !== -1) return { weekIndex: wi, dayIndex: di, exerciseIndex: ei };
    }
  return null;
}

function locateDay(weeks: WeekPlan[], dayId: string): { weekIndex: number; dayIndex: number } | null {
  for (let wi = 0; wi < weeks.length; wi++) {
    const di = weeks[wi].days.findIndex((d) => d.id === dayId);
    if (di !== -1) return { weekIndex: wi, dayIndex: di };
  }
  return null;
}

const clamp = (n: number, max: number) => Math.max(0, Math.min(n, max));

export function applyOps(programme: Programme, ops: EditOp[], progress: ProgressMap = {}): ApplyResult {
  // Deep-clone the weeks tree once, then edit the clone in place — callers see
  // immutability; internally this keeps every op handler simple.
  let weeks: WeekPlan[] = JSON.parse(JSON.stringify(programme.weeks));
  let name = programme.name;
  const warnings: Warning[] = [];
  const taken = allIds(weeks);

  const warnLogs = (label: string, affected: boolean) => {
    if (affected) warnings.push({ code: 'logged-sets-affected', message: `${label} has logged sets this cycle — they'll no longer be shown.` });
  };

  for (let i = 0; i < ops.length; i++) {
    const op = ops[i];
    const fail = (message: string): ApplyResult => ({ ok: false, errors: [{ opIndex: i, message }] });

    switch (op.type) {
      case 'update-exercise': {
        const loc = locateExercise(weeks, op.exerciseId);
        if (!loc) return fail(`No exercise with id "${op.exerciseId}".`);
        const day = weeks[loc.weekIndex].days[loc.dayIndex];
        const ex = day.exercises[loc.exerciseIndex];
        if (op.patch.name !== undefined && op.patch.name !== ex.name) {
          warnings.push({ code: 'rename-detaches-history', message: `Renaming "${ex.name}" to "${op.patch.name}" — past history and PRs stay under the old name.` });
        }
        if (op.patch.sets !== undefined && op.patch.sets < ex.sets) {
          const orphaned = Array.from({ length: ex.sets - op.patch.sets }, (_, k) => op.patch.sets! + k)
            .some((idx) => progress[`${ex.id}-${idx}`] !== undefined);
          warnLogs(`"${ex.name}"`, orphaned);
        }
        day.exercises[loc.exerciseIndex] = { ...ex, ...op.patch };
        break;
      }
      case 'add-exercise': {
        const loc = locateDay(weeks, op.dayId);
        if (!loc) return fail(`No day with id "${op.dayId}".`);
        const day = weeks[loc.weekIndex].days[loc.dayIndex];
        const ex = materialiseExercise(op.exercise, taken);
        day.exercises.splice(clamp(op.index ?? day.exercises.length, day.exercises.length), 0, ex);
        break;
      }
      case 'remove-exercise': {
        const loc = locateExercise(weeks, op.exerciseId);
        if (!loc) return fail(`No exercise with id "${op.exerciseId}".`);
        const day = weeks[loc.weekIndex].days[loc.dayIndex];
        if (day.exercises.length === 1) return fail(`Removing "${day.exercises[0].name}" would leave "${day.title}" empty — remove the day instead.`);
        warnLogs(`"${day.exercises[loc.exerciseIndex].name}"`, hasLogs(progress, op.exerciseId));
        day.exercises.splice(loc.exerciseIndex, 1);
        break;
      }
      case 'reorder-exercise': {
        const loc = locateExercise(weeks, op.exerciseId);
        if (!loc) return fail(`No exercise with id "${op.exerciseId}".`);
        const day = weeks[loc.weekIndex].days[loc.dayIndex];
        const [ex] = day.exercises.splice(loc.exerciseIndex, 1);
        day.exercises.splice(clamp(op.toIndex, day.exercises.length), 0, ex);
        break;
      }
      case 'update-day': {
        const loc = locateDay(weeks, op.dayId);
        if (!loc) return fail(`No day with id "${op.dayId}".`);
        const day = weeks[loc.weekIndex].days[loc.dayIndex];
        weeks[loc.weekIndex].days[loc.dayIndex] = { ...day, ...op.patch };
        break;
      }
      case 'replace-day': {
        const loc = locateDay(weeks, op.dayId);
        if (!loc) return fail(`No day with id "${op.dayId}".`);
        const old = weeks[loc.weekIndex].days[loc.dayIndex];
        // Payload ids may only reference ids that live inside the replaced day.
        const oldIds = new Set<string>([old.id, ...old.exercises.map((e) => e.id)]);
        const carried = [op.day.id, ...op.day.exercises.map((e) => e.id)].filter((x): x is string => !!x);
        for (const cid of carried) if (!oldIds.has(cid)) return fail(`replace-day payload reuses id "${cid}" from outside the replaced day.`);
        const droppedLogged = old.exercises.some(
          (e) => !carried.includes(e.id) && hasLogs(progress, e.id)
        );
        warnLogs(`"${old.title}"`, droppedLogged);
        const fresh = materialiseDay({ ...op.day, id: op.day.id ?? old.id }, taken);
        weeks[loc.weekIndex].days[loc.dayIndex] = fresh;
        break;
      }
      case 'add-day': {
        const wi = weeks.findIndex((w) => w.id === op.weekId);
        if (wi === -1) return fail(`No week with id "${op.weekId}".`);
        if (weeks[wi].days.length >= 7) return fail('A week already has 7 days.');
        const day = materialiseDay(op.day, taken);
        weeks[wi].days.splice(clamp(op.index ?? weeks[wi].days.length, weeks[wi].days.length), 0, day);
        break;
      }
      case 'remove-day': {
        const loc = locateDay(weeks, op.dayId);
        if (!loc) return fail(`No day with id "${op.dayId}".`);
        if (weeks[loc.weekIndex].days.length === 1) return fail('Removing the last day would leave the week empty — remove the week instead.');
        const day = weeks[loc.weekIndex].days[loc.dayIndex];
        warnLogs(`"${day.title}"`, dayHasLogs(progress, day));
        weeks[loc.weekIndex].days.splice(loc.dayIndex, 1);
        break;
      }
      case 'move-day': {
        const loc = locateDay(weeks, op.dayId);
        if (!loc) return fail(`No day with id "${op.dayId}".`);
        const days = weeks[loc.weekIndex].days;
        const [day] = days.splice(loc.dayIndex, 1);
        days.splice(clamp(op.toIndex, days.length), 0, day);
        break;
      }
      case 'update-week': {
        const wi = weeks.findIndex((w) => w.id === op.weekId);
        if (wi === -1) return fail(`No week with id "${op.weekId}".`);
        weeks[wi] = { ...weeks[wi], ...op.patch };
        break;
      }
      case 'replace-week': {
        const wi = weeks.findIndex((w) => w.id === op.weekId);
        if (wi === -1) return fail(`No week with id "${op.weekId}".`);
        const old = weeks[wi];
        const oldIds = new Set<string>();
        for (const d of old.days) {
          oldIds.add(d.id);
          for (const e of d.exercises) oldIds.add(e.id);
        }
        const carried: string[] = [];
        for (const d of op.week.days) {
          if (d.id) carried.push(d.id);
          for (const e of d.exercises) if (e.id) carried.push(e.id);
        }
        for (const cid of carried) if (!oldIds.has(cid)) return fail(`replace-week payload reuses id "${cid}" from outside the replaced week.`);
        const droppedLogged = old.days.some((d) =>
          d.exercises.some((e) => !carried.includes(e.id) && hasLogs(progress, e.id))
        );
        warnLogs(`Week ${old.weekNumber}`, droppedLogged);
        const fresh = materialiseWeek(op.week, taken);
        weeks[wi] = { ...fresh, id: old.id };
        break;
      }
      case 'remove-week': {
        const wi = weeks.findIndex((w) => w.id === op.weekId);
        if (wi === -1) return fail(`No week with id "${op.weekId}".`);
        if (weeks.length === 1) return fail('Cannot remove the only week in the programme.');
        warnings.push({ code: 'remove-week', message: `Removing week ${weeks[wi].weekNumber} ("${weeks[wi].focus}").` });
        weeks.splice(wi, 1);
        break;
      }
      case 'update-programme': {
        name = op.patch.name;
        break;
      }
      case 'append-weeks': {
        for (const wp of op.weeks) weeks.push(materialiseWeek(wp, taken));
        break;
      }
    }
  }

  weeks = renumber(weeks);

  // Global id-uniqueness backstop: a payload bug must never create colliding
  // ids — set logs key off them.
  const seen = new Set<string>();
  for (const w of weeks) {
    for (const id of [w.id, ...w.days.flatMap((d) => [d.id, ...d.exercises.map((e) => e.id)])]) {
      if (seen.has(id)) return { ok: false, errors: [{ opIndex: -1, message: `Duplicate id "${id}" after applying ops.` }] };
      seen.add(id);
    }
  }

  return {
    ok: true,
    warnings,
    programme: { ...programme, name, weeks, revision: programme.revision + 1 },
  };
}
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `npx vitest run src/lib/programme/engine.test.ts` — expected PASS — and `npm run lint`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/programme/engine.ts src/lib/programme/engine.test.ts
git commit -m "feat: programme editing engine — exercise ops, atomicity, warnings"
```

---

### Task 3: Engine — day/week/programme ops tests + describeOps

**Files:**
- Create: `src/lib/programme/describe.ts`
- Test: `src/lib/programme/engine-structure.test.ts`, `src/lib/programme/describe.test.ts`

**Interfaces:**
- Consumes: `applyOps`, `makeTestProgramme` (import from `./engine.test`), `EditOp`, `Programme`.
- Produces: `describeOps(ops: EditOp[], programme: Programme): string[]` — one human-readable line per op, used by diff cards, apply confirmations, and undo labels.

- [ ] **Step 1: Write the failing structural tests**

Create `src/lib/programme/engine-structure.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { applyOps } from './engine';
import { makeTestProgramme } from './engine.test';

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
```

- [ ] **Step 2: Run — these should PASS already** (they exercise Task 2's engine). If any fail, fix the engine, not the test. Then write the failing describe tests.

Create `src/lib/programme/describe.test.ts`:

```ts
import { describe, it, expect } from 'vitest';
import { describeOps } from './describe';
import { makeTestProgramme } from './engine.test';

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
```

- [ ] **Step 3: Run describe tests to verify they fail**

Run: `npx vitest run src/lib/programme/describe.test.ts` — expected FAIL (module missing).

- [ ] **Step 4: Implement describeOps**

Create `src/lib/programme/describe.ts`:

```ts
import { Exercise, WeekPlan } from '../../data';
import { Programme } from './types';
import { EditOp } from './ops';

const rx = (e: { sets: number; reps: string; load?: string }) =>
  `${e.sets}×${e.reps}${e.load ? ` @ ${e.load}` : ''}`;

const dayLetter = (title: string) => title.split(':')[0];

function find(weeks: WeekPlan[], exerciseId: string) {
  for (const w of weeks)
    for (const d of w.days) {
      const e = d.exercises.find((x) => x.id === exerciseId);
      if (e) return { w, d, e };
    }
  return null;
}

function findDay(weeks: WeekPlan[], dayId: string) {
  for (const w of weeks) {
    const d = w.days.find((x) => x.id === dayId);
    if (d) return { w, d };
  }
  return null;
}

const plural = (n: number, unit: string) => `${n} ${unit}${n === 1 ? '' : 's'}`;

/** One human-readable line per op, against the PRE-edit programme. */
export function describeOps(ops: EditOp[], programme: Programme): string[] {
  const weeks = programme.weeks;
  return ops.map((op) => {
    switch (op.type) {
      case 'update-exercise': {
        const hit = find(weeks, op.exerciseId);
        if (!hit) return `Edit exercise ${op.exerciseId} (not found)`;
        const { w, d, e } = hit;
        const next: Exercise = { ...e, ...op.patch };
        const where = `Week ${w.weekNumber}, ${dayLetter(d.title)}`;
        if (op.patch.name && op.patch.name !== e.name) return `${where}: renamed ${e.name} → ${op.patch.name}`;
        if (op.patch.restSec !== undefined && op.patch.sets === undefined && op.patch.reps === undefined && op.patch.load === undefined)
          return `${where}: ${e.name} — rest ${e.restSec}s → ${op.patch.restSec}s`;
        return `${where}: ${e.name} — ${rx(e)} → ${rx(next)}`;
      }
      case 'add-exercise': {
        const hit = findDay(weeks, op.dayId);
        return `Added ${op.exercise.name} (${rx(op.exercise)}) to ${hit ? `week ${hit.w.weekNumber}, ${dayLetter(hit.d.title)}` : op.dayId}`;
      }
      case 'remove-exercise': {
        const hit = find(weeks, op.exerciseId);
        if (!hit) return `Remove exercise ${op.exerciseId} (not found)`;
        return `Removed ${hit.e.name} from week ${hit.w.weekNumber}, ${dayLetter(hit.d.title)}`;
      }
      case 'reorder-exercise': {
        const hit = find(weeks, op.exerciseId);
        return hit ? `Moved ${hit.e.name} to position ${op.toIndex + 1} in ${dayLetter(hit.d.title)}` : `Reorder ${op.exerciseId} (not found)`;
      }
      case 'update-day': {
        const hit = findDay(weeks, op.dayId);
        return hit ? `Renamed ${hit.d.title} → ${op.patch.title}` : `Rename day ${op.dayId} (not found)`;
      }
      case 'replace-day': {
        const hit = findDay(weeks, op.dayId);
        return hit
          ? `Replaced week ${hit.w.weekNumber} ${dayLetter(hit.d.title)} (${plural(hit.d.exercises.length, 'exercise')} → ${plural(op.day.exercises.length, 'exercise')}): ${op.day.title}`
          : `Replace day ${op.dayId} (not found)`;
      }
      case 'add-day': {
        const w = weeks.find((x) => x.id === op.weekId);
        return `Added ${op.day.title} to week ${w ? w.weekNumber : op.weekId}`;
      }
      case 'remove-day': {
        const hit = findDay(weeks, op.dayId);
        return hit ? `Removed ${hit.d.title} from week ${hit.w.weekNumber}` : `Remove day ${op.dayId} (not found)`;
      }
      case 'move-day': {
        const hit = findDay(weeks, op.dayId);
        return hit ? `Moved ${hit.d.title} to position ${op.toIndex + 1} in week ${hit.w.weekNumber}` : `Move day ${op.dayId} (not found)`;
      }
      case 'update-week': {
        const w = weeks.find((x) => x.id === op.weekId);
        return `Updated week ${w ? w.weekNumber : op.weekId} notes`;
      }
      case 'replace-week': {
        const w = weeks.find((x) => x.id === op.weekId);
        return w
          ? `Replaced week ${w.weekNumber} (${plural(w.days.length, 'day')} → ${plural(op.week.days.length, 'day')}): ${op.week.focus}`
          : `Replace week ${op.weekId} (not found)`;
      }
      case 'remove-week': {
        const w = weeks.find((x) => x.id === op.weekId);
        return `Removed week ${w ? w.weekNumber : op.weekId}`;
      }
      case 'update-programme':
        return `Renamed programme → ${op.patch.name}`;
      case 'append-weeks':
        return `Added ${plural(op.weeks.length, 'week')} to the end of the programme`;
    }
  });
}
```

- [ ] **Step 5: Run all unit tests**

Run: `npm run test:unit` — expected all PASS — and `npm run lint`.

- [ ] **Step 6: Commit**

```bash
git add src/lib/programme/
git commit -m "feat: structural op coverage and describeOps diff lines"
```

---

### Task 4: Store — persistence, migration, undo, React hooks

**Files:**
- Create: `src/lib/programme/store.ts`
- Test: `src/lib/programme/store.test.ts`

**Interfaces:**
- Consumes: `TRAINING_PLAN` from `../../data`; `applyOps`; `describeOps`; `Programme`; `EditOp`; `PROGRESS_KEY`.
- Produces (everything later tasks touch):
  - `PROGRAMME_KEY = 'vb-programme-v1'`, `UNDO_KEY = 'vb-programme-undo-v1'`, `PROFILE_KEY = 'vb-profile-v1'`
  - `getProgramme(): Programme` (lazy-migrates from seed), `getWeeks(): WeekPlan[]`
  - `useProgramme(): Programme`, `useWeeks(): WeekPlan[]` (React, `useSyncExternalStore`)
  - `applyEdits(ops: EditOp[]): ApplyResult` (apply + undo push + persist + notify)
  - `undoLast(): boolean`, `getUndoCount(): number`
  - `getProfile(): Profile | null`, `saveProfile(p: Profile): void`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/programme/store.test.ts` (localStorage needs a DOM env — note the pragma):

```ts
// @vitest-environment happy-dom
import { describe, it, expect, beforeEach } from 'vitest';
import { TRAINING_PLAN } from '../../data';

async function freshStore() {
  // The store caches module-level state; re-import fresh per test.
  const mod = await import(`./store?t=${Math.random()}`);
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
```

Note: `w1-d1-e1` in the real seed is Hang Power Clean with `sets: 5` in week 1 (`CLEAN[1].sets === 5`) — that's why the undo assertion expects 5.

- [ ] **Step 2: Run to verify failure**, then implement.

Create `src/lib/programme/store.ts`:

```ts
// User-owned programme state. The programme lives at vb-programme-v1 and is the
// display source of truth for every page; src/data.ts remains the frozen seed.
// Mutations ONLY flow through applyEdits (engine + undo + persist + notify).

import { useSyncExternalStore } from 'react';
import { WeekPlan, TRAINING_PLAN } from '../../data';
import { ProgressMap, PROGRESS_KEY } from '../progress';
import { Programme, Profile } from './types';
import { EditOp } from './ops';
import { applyOps, ApplyResult } from './engine';
import { describeOps } from './describe';

export const PROGRAMME_KEY = 'vb-programme-v1';
export const UNDO_KEY = 'vb-programme-undo-v1';
export const PROFILE_KEY = 'vb-profile-v1';
const UNDO_CAP = 20;

type UndoEntry = { revision: number; at: number; label: string; programme: Programme };

let cache: Programme | null = null;
const listeners = new Set<() => void>();

function notify() {
  for (const l of listeners) l();
}

function coerceProgramme(value: unknown): Programme | null {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return null;
  const p = value as Programme;
  if (typeof p.id !== 'string' || typeof p.revision !== 'number' || !Array.isArray(p.weeks)) return null;
  if (!p.weeks.every((w) => w && typeof w.id === 'string' && Array.isArray(w.days))) return null;
  return p;
}

function seedProgramme(): Programme {
  return {
    id: 'prog-seed',
    name: 'Volleyball Strength',
    source: 'seed',
    createdAt: Date.now(),
    revision: 0,
    weeks: JSON.parse(JSON.stringify(TRAINING_PLAN)) as WeekPlan[],
  };
}

function persist(p: Programme) {
  try {
    window.localStorage.setItem(PROGRAMME_KEY, JSON.stringify(p));
  } catch {
    // storage full/blocked — keep the in-memory copy working
  }
}

export function getProgramme(): Programme {
  if (cache) return cache;
  try {
    const raw = window.localStorage.getItem(PROGRAMME_KEY);
    if (raw !== null) {
      const coerced = coerceProgramme(JSON.parse(raw));
      if (coerced) {
        cache = coerced;
        return cache;
      }
    }
  } catch {
    // corrupt — fall through to re-seed
  }
  cache = seedProgramme();
  persist(cache);
  return cache;
}

export const getWeeks = (): WeekPlan[] => getProgramme().weeks;

function subscribe(cb: () => void): () => void {
  listeners.add(cb);
  return () => listeners.delete(cb);
}

export function useProgramme(): Programme {
  return useSyncExternalStore(subscribe, getProgramme);
}

export const useWeeks = (): WeekPlan[] => useProgramme().weeks;

function readProgress(): ProgressMap {
  try {
    const raw = window.localStorage.getItem(PROGRESS_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) return parsed as ProgressMap;
  } catch {
    // unreadable progress just means no logged-set warnings
  }
  return {};
}

function readUndo(): UndoEntry[] {
  try {
    const raw = window.localStorage.getItem(UNDO_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (Array.isArray(parsed)) return parsed as UndoEntry[];
  } catch {
    // corrupt undo stack is disposable
  }
  return [];
}

function writeUndo(entries: UndoEntry[]) {
  try {
    window.localStorage.setItem(UNDO_KEY, JSON.stringify(entries.slice(-UNDO_CAP)));
  } catch {
    // undo is a convenience, never worth crashing over
  }
}

export function applyEdits(ops: EditOp[]): ApplyResult {
  const current = getProgramme();
  const result = applyOps(current, ops, readProgress());
  if (!result.ok) return result;
  const label = describeOps(ops, current)[0] ?? 'Edit';
  writeUndo([...readUndo(), { revision: current.revision, at: Date.now(), label, programme: current }]);
  cache = result.programme;
  persist(cache);
  notify();
  return result;
}

export function getUndoCount(): number {
  return readUndo().length;
}

export function undoLast(): boolean {
  const entries = readUndo();
  const last = entries.pop();
  if (!last) return false;
  writeUndo(entries);
  cache = last.programme;
  persist(cache);
  notify();
  return true;
}

/** Install a whole new programme (AI generation / future templates). */
export function installProgramme(p: Programme) {
  cache = p;
  persist(cache);
  writeUndo([]);
  notify();
}

export function getProfile(): Profile | null {
  try {
    const raw = window.localStorage.getItem(PROFILE_KEY);
    const parsed = raw ? (JSON.parse(raw) as unknown) : null;
    if (parsed && typeof parsed === 'object' && typeof (parsed as Profile).goals === 'string') {
      return parsed as Profile;
    }
  } catch {
    // corrupt profile — treat as absent
  }
  return null;
}

export function saveProfile(p: Profile) {
  try {
    window.localStorage.setItem(PROFILE_KEY, JSON.stringify(p));
  } catch {
    // ignore
  }
}

// Cross-tab: another tab wrote the programme — drop the cache and re-read.
if (typeof window !== 'undefined') {
  window.addEventListener('storage', (e) => {
    if (e.key === null || e.key === PROGRAMME_KEY) {
      cache = null;
      notify();
    }
  });
}
```

- [ ] **Step 3: Run tests**

Run: `npm run test:unit` — all PASS — and `npm run lint`.

- [ ] **Step 4: Commit**

```bash
git add src/lib/programme/store.ts src/lib/programme/store.test.ts
git commit -m "feat: programme store — migration, persistence, undo, hooks"
```

---

### Task 5: Swap every TRAINING_PLAN consumer to the store

**Files:**
- Modify: `src/pages/HomePage.tsx`, `src/pages/WeeksPage.tsx`, `src/pages/WeekOverview.tsx`, `src/pages/WorkoutPage.tsx`, `src/pages/CompletionPage.tsx`, `src/pages/CongratsPage.tsx`, `src/pages/ExercisePage.tsx`, `src/components/ExerciseHistory.tsx`, `src/components/ActiveWorkoutPill.tsx`, `src/lib/bests.ts`

**Interfaces:**
- Consumes: `useWeeks()` (React components), `getWeeks()` (non-React code) from `../lib/programme/store` (adjust relative path per file).

After this task, nothing outside `src/lib/programme/store.ts` imports `TRAINING_PLAN` (grep must confirm).

- [ ] **Step 1: Mechanical swap, per file**

The pattern for React components: delete `TRAINING_PLAN` from the `../data` import (keep other named imports like `WorkoutDay`, `IN_SEASON_ADJUSTMENTS`), add `import { useWeeks } from '../lib/programme/store';`, add `const weeks = useWeeks();` as the first hook in the component, and replace every `TRAINING_PLAN` reference with `weeks`. Specifics:

| File | Notes |
|---|---|
| `HomePage.tsx` | 5 references (lines ~23, 63–65, 70, 187). The week-override clamp at line 23 lives inside a `useLocalStorage` coercion — it must read `weeks.length`; `weeks` must be declared before it. |
| `WeeksPage.tsx` | Loop at line 21. |
| `WeekOverview.tsx` | Line 31 find; line 103 type `(typeof TRAINING_PLAN)[number]` → import and use `WeekPlan` from `../data`. |
| `WorkoutPage.tsx` | Line 142 day lookup, 335 `getPreviousSetLog`, 708 `ConflictContent` — `ConflictContent` is its own component: give it its own `const weeks = useWeeks();`. |
| `CompletionPage.tsx` | Line 32 find-day loop. |
| `CongratsPage.tsx` | Line 77 find-day loop. |
| `ExercisePage.tsx` | Line 13 walk. |
| `ExerciseHistory.tsx` | Line 26 walk. |
| `ActiveWorkoutPill.tsx` | Line 18 find-day loop. |
| `bests.ts` | NOT a component — replace `TRAINING_PLAN` import with `import { getWeeks } from './programme/store';` and in `bootstrapFromProgress` iterate `getWeeks()`. No hooks. |

- [ ] **Step 2: Verify no stragglers**

Run: `grep -rn "TRAINING_PLAN" src/ | grep -v "data.ts" | grep -v "programme/store"`
Expected: no output.

- [ ] **Step 3: Type-check, unit tests, and full Playwright suite**

Run: `npm run lint && npm run test:unit && npm run build && npx playwright test`
Expected: all green — behaviour is identical for a fresh or existing user (migration forks the same data with the same ids).

- [ ] **Step 4: Commit**

```bash
git add src/
git commit -m "refactor: all pages read the user-owned programme store, not TRAINING_PLAN"
```

---

### Task 6: Manual edit UI — WorkoutPage edit mode + exercise sheet

**Files:**
- Create: `src/components/EditExerciseSheet.tsx`
- Modify: `src/pages/WorkoutPage.tsx`
- Test: `tests/edit-workout.spec.ts`

**Interfaces:**
- Consumes: `applyEdits`, `applyOps`, `getProgramme`, `undoLast`, `getUndoCount`, `describeOps`, `EditOp`.
- Produces: `<EditExerciseSheet day={WorkoutDay} exercise={Exercise | null} open onClose />` — `exercise: null` means "add new exercise to this day".

- [ ] **Step 1: Read one existing Playwright spec** in `tests/` to copy its setup idioms (baseURL, localStorage seeding), then write `tests/edit-workout.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test('edit an exercise prescription from the workout page', async ({ page }) => {
  await page.goto('/workout/w1-d1');
  await page.getByRole('button', { name: 'Edit workout' }).click();
  await page.getByRole('button', { name: 'Edit Back Squat' }).click();
  await page.getByLabel('Sets').fill('3');
  await page.getByLabel('Reps').fill('5');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await expect(page.getByText('3 × 5')).toBeVisible();
  // survives reload (persisted)
  await page.reload();
  await expect(page.getByText('3 × 5')).toBeVisible();
});

test('undo restores the previous prescription', async ({ page }) => {
  await page.goto('/workout/w1-d1');
  await page.getByRole('button', { name: 'Edit workout' }).click();
  await page.getByRole('button', { name: 'Edit Back Squat' }).click();
  await page.getByLabel('Sets').fill('2');
  await page.getByRole('button', { name: 'Save changes' }).click();
  await page.getByRole('button', { name: 'Undo last edit' }).click();
  await expect(page.getByText('4 × 6')).toBeVisible();
});

test('removing an exercise with logged sets shows a warning first', async ({ page }) => {
  await page.goto('/workout/w1-d1');
  await page.evaluate(() => {
    localStorage.setItem('volleyball-workout-progress-v3', JSON.stringify({ 'w1-d1-e2-0': { completed: true } }));
  });
  await page.reload();
  await page.getByRole('button', { name: 'Edit workout' }).click();
  await page.getByRole('button', { name: 'Edit Back Squat' }).click();
  await page.getByRole('button', { name: 'Remove exercise' }).click();
  await expect(page.getByText(/logged sets/i)).toBeVisible();
  await page.getByRole('button', { name: 'Remove anyway' }).click();
  await expect(page.getByRole('heading', { name: /Back Squat/ })).toHaveCount(0);
});
```

(Adjust selectors to match the implementation below if needed — but keep the behavioural assertions.)

- [ ] **Step 2: Implement `EditExerciseSheet`**

Create `src/components/EditExerciseSheet.tsx`:

```tsx
import React, { useEffect, useState } from 'react';
import { ArrowDown, ArrowUp } from 'lucide-react';
import { Exercise, WorkoutDay, Tracking } from '../data';
import { BottomSheet } from './BottomSheet';
import { cn } from '../lib/utils';
import { hapticSelect, hapticTap } from '../lib/feedback';
import { EditOp } from '../lib/programme/ops';
import { applyOps } from '../lib/programme/engine';
import { applyEdits, getProgramme } from '../lib/programme/store';
import { formatElapsed } from '../pages/WorkoutPage';

const REST_CHOICES = [0, 30, 60, 90, 120, 150, 180, 240, 300];
const TRACKING_CHOICES: { id: Tracking; label: string }[] = [
  { id: 'weighted', label: 'Weight + reps' },
  { id: 'reps', label: 'Reps only' },
  { id: 'time', label: 'Time' },
];

/** Edit one exercise, or add one (exercise === null). All changes go through applyEdits. */
export const EditExerciseSheet: React.FC<{
  day: WorkoutDay;
  exercise: Exercise | null;
  open: boolean;
  onClose: () => void;
}> = ({ day, exercise, open, onClose }) => {
  const [name, setName] = useState('');
  const [sets, setSets] = useState('3');
  const [reps, setReps] = useState('');
  const [load, setLoad] = useState('');
  const [notes, setNotes] = useState('');
  const [restSec, setRestSec] = useState(90);
  const [tracking, setTracking] = useState<Tracking>('weighted');
  const [confirmRemove, setConfirmRemove] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Re-seed the form whenever the sheet opens for a target.
  useEffect(() => {
    if (!open) return;
    setConfirmRemove(null);
    setError(null);
    setName(exercise?.name ?? '');
    setSets(String(exercise?.sets ?? 3));
    setReps(exercise?.reps ?? '');
    setLoad(exercise?.load ?? '');
    setNotes(exercise?.notes ?? '');
    setRestSec(exercise?.restSec ?? 90);
    setTracking(exercise?.tracking ?? 'weighted');
  }, [open, exercise]);

  const submit = () => {
    hapticSelect();
    const setsNum = parseInt(sets, 10);
    if (!name.trim() || !reps.trim() || !(setsNum >= 1)) {
      setError('Name, sets and reps are required.');
      return;
    }
    const ops: EditOp[] = exercise
      ? [{
          type: 'update-exercise',
          exerciseId: exercise.id,
          patch: { name: name.trim(), sets: setsNum, reps: reps.trim(), load: load.trim() || undefined, notes: notes.trim() || undefined, tracking, restSec },
        }]
      : [{
          type: 'add-exercise',
          dayId: day.id,
          exercise: { name: name.trim(), sets: setsNum, reps: reps.trim(), load: load.trim() || undefined, notes: notes.trim() || undefined, tracking, restSec },
        }];
    const res = applyEdits(ops);
    if (!res.ok) {
      setError(res.errors[0].message);
      return;
    }
    onClose();
  };

  const remove = (force: boolean) => {
    if (!exercise) return;
    hapticTap();
    const ops: EditOp[] = [{ type: 'remove-exercise', exerciseId: exercise.id }];
    if (!force) {
      // Dry-run against the current programme to surface warnings before applying.
      const progressRaw = window.localStorage.getItem('volleyball-workout-progress-v3');
      const progress = progressRaw ? JSON.parse(progressRaw) : {};
      const dry = applyOps(getProgramme(), ops, progress);
      if (dry.ok && dry.warnings.length > 0) {
        setConfirmRemove(dry.warnings[0].message);
        return;
      }
      if (!dry.ok) {
        setError(dry.errors[0].message);
        return;
      }
    }
    const res = applyEdits(ops);
    if (!res.ok) {
      setError(res.errors[0].message);
      return;
    }
    onClose();
  };

  const move = (dir: -1 | 1) => {
    if (!exercise) return;
    hapticTap();
    const idx = day.exercises.findIndex((e) => e.id === exercise.id);
    applyEdits([{ type: 'reorder-exercise', exerciseId: exercise.id, toIndex: Math.max(0, idx + dir) }]);
    onClose();
  };

  const field = 'w-full bg-ink/10 rounded-xl px-3.5 py-3 text-sm font-bold text-ink focus:outline-none focus:ring-2 focus:ring-primary';
  const label = 'block text-[0.6875rem] font-bold text-secondary mb-1.5';

  return (
    <BottomSheet open={open} onClose={onClose} title={exercise ? 'Edit exercise' : 'Add exercise'} subtitle={exercise?.name}>
      <div className="space-y-4 max-h-[65vh] overflow-y-auto -mx-1 px-1">
        <div>
          <label htmlFor="edit-name" className={label}>Name</label>
          <input id="edit-name" aria-label="Name" value={name} onChange={(e) => setName(e.target.value)} className={field} />
          {exercise && name.trim() && name.trim() !== exercise.name && (
            <p className="text-xs text-accent mt-1.5">Renaming starts fresh history — past logs and bests stay under "{exercise.name}".</p>
          )}
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label htmlFor="edit-sets" className={label}>Sets</label>
            <input id="edit-sets" aria-label="Sets" type="number" inputMode="numeric" value={sets} onChange={(e) => setSets(e.target.value)} className={field} />
          </div>
          <div>
            <label htmlFor="edit-reps" className={label}>Reps</label>
            <input id="edit-reps" aria-label="Reps" value={reps} onChange={(e) => setReps(e.target.value)} placeholder="6-8" className={field} />
          </div>
        </div>
        <div>
          <label htmlFor="edit-load" className={label}>Load</label>
          <input id="edit-load" aria-label="Load" value={load} onChange={(e) => setLoad(e.target.value)} placeholder="70% TM, RPE 7, Bodyweight…" className={field} />
        </div>
        <div>
          <label htmlFor="edit-notes" className={label}>Notes</label>
          <input id="edit-notes" aria-label="Notes" value={notes} onChange={(e) => setNotes(e.target.value)} className={field} />
        </div>
        <div>
          <span className={label}>Tracking</span>
          <div className="flex gap-2">
            {TRACKING_CHOICES.map((t) => (
              <button key={t.id} onClick={() => { hapticTap(); setTracking(t.id); }}
                className={cn('px-3 py-2 rounded-full text-xs font-bold transition-colors', tracking === t.id ? 'bg-ink text-surface' : 'bg-ink/10 text-secondary hover:bg-ink/20')}>
                {t.label}
              </button>
            ))}
          </div>
        </div>
        <div>
          <span className={label}>Rest</span>
          <div className="grid grid-cols-3 gap-2">
            {REST_CHOICES.map((s) => (
              <button key={s} onClick={() => { hapticTap(); setRestSec(s); }}
                className={cn('py-2.5 rounded-xl font-bold text-sm tabular-nums transition-colors', restSec === s ? 'bg-primary text-onfill' : 'bg-ink/10 hover:bg-ink/20')}>
                {s === 0 ? 'Off' : formatElapsed(s)}
              </button>
            ))}
          </div>
        </div>

        {error && <p className="text-sm font-bold text-danger">{error}</p>}

        <button onClick={submit} className="w-full bg-primary text-onfill font-bold text-sm py-3.5 rounded-xl transition-transform active:scale-[0.98]">
          {exercise ? 'Save changes' : 'Add exercise'}
        </button>

        {exercise && (
          <>
            <div className="flex gap-2">
              <button onClick={() => move(-1)} className="flex-1 flex items-center justify-center gap-1.5 bg-ink/10 hover:bg-ink/20 font-bold text-sm py-3 rounded-xl transition-colors">
                <ArrowUp className="w-4 h-4" /> Move up
              </button>
              <button onClick={() => move(1)} className="flex-1 flex items-center justify-center gap-1.5 bg-ink/10 hover:bg-ink/20 font-bold text-sm py-3 rounded-xl transition-colors">
                <ArrowDown className="w-4 h-4" /> Move down
              </button>
            </div>
            {confirmRemove ? (
              <div className="bg-danger/10 rounded-xl px-4 py-3.5">
                <p className="text-sm font-bold text-danger text-center mb-3">{confirmRemove}</p>
                <button onClick={() => remove(true)} className="w-full bg-danger text-ink font-bold text-sm py-3.5 rounded-xl transition-transform active:scale-[0.98]">
                  Remove anyway
                </button>
              </div>
            ) : (
              <button onClick={() => remove(false)} className="w-full bg-ink/10 hover:bg-ink/20 text-danger font-bold text-sm py-3.5 rounded-xl transition-colors">
                Remove exercise
              </button>
            )}
          </>
        )}
      </div>
    </BottomSheet>
  );
};
```

- [ ] **Step 3: Wire edit mode into WorkoutPage**

In `src/pages/WorkoutPage.tsx`:

1. Imports: add `Pencil, RotateCcw, Plus` to the lucide import (Plus already imported); add `import { EditExerciseSheet } from '../components/EditExerciseSheet';` and `import { undoLast, getUndoCount } from '../lib/programme/store';`.
2. State (near the other `useState` calls): `const [editMode, setEditMode] = useState(false);` and `const [editTarget, setEditTarget] = useState<{ exercise: Exercise | null } | null>(null);` (`{ exercise: null }` = add-new; `null` = sheet closed).
3. Header: when `!live`, render next to the `Preview` badge an icon button — `aria-label="Edit workout"`, `onClick={() => { hapticTap(); setEditMode((m) => !m); }}`, same 10×10 round `bg-ink/10` styling as the back button, with `<Pencil className="w-4 h-4" />`; when `editMode`, swap classes to `bg-ink text-surface`. When `live`, don't render it (the AI handles mid-workout changes; keeps the live header uncluttered).
4. In the exercise list, when `editMode`, render under each exercise header a small button `aria-label={`Edit ${exercise.name}`}` with `<Pencil className="w-3.5 h-3.5" /> Edit` (pill, `bg-ink/10`, text-xs font-bold) that calls `setEditTarget({ exercise })`. Simplest placement: pass a new optional prop `onEdit?: () => void` into `ExerciseSection` and render the pill right after the exercise-header row when the prop is set; pass it only when `editMode`.
5. After the exercises list (inside `<main>`), when `editMode`:

```tsx
<div className="mt-8 space-y-2">
  <button
    onClick={() => { hapticTap(); setEditTarget({ exercise: null }); }}
    className="w-full flex items-center justify-center gap-1.5 bg-ink/10 hover:bg-ink/20 font-bold text-sm py-3.5 rounded-xl transition-colors"
  >
    <Plus className="w-4 h-4" /> Add exercise
  </button>
  {getUndoCount() > 0 && (
    <button
      onClick={() => { hapticTap(); undoLast(); }}
      aria-label="Undo last edit"
      className="w-full flex items-center justify-center gap-1.5 bg-ink/10 hover:bg-ink/20 text-secondary font-bold text-sm py-3.5 rounded-xl transition-colors"
    >
      <RotateCcw className="w-4 h-4" /> Undo last edit
    </button>
  )}
</div>
```

6. Render the sheet at the end, next to the other sheets: `<EditExerciseSheet day={day} exercise={editTarget?.exercise ?? null} open={editTarget !== null} onClose={() => setEditTarget(null)} />`.
7. The page already re-renders on store changes because the day lookup now reads `useWeeks()` (Task 5) — the `day` variable picks up the fresh object.

- [ ] **Step 4: Run the new spec and the full suites**

Run: `npm run build && npx playwright test tests/edit-workout.spec.ts` then `npx playwright test && npm run lint && npm run test:unit`
Expected: all PASS. Fix selector drift in the spec if the implementation's accessible names differ.

- [ ] **Step 5: Commit**

```bash
git add src/components/EditExerciseSheet.tsx src/pages/WorkoutPage.tsx tests/edit-workout.spec.ts
git commit -m "feat: manual exercise editing on the workout page"
```

---

### Task 7: Manual edit UI — WeekOverview day menu (move/remove)

**Files:**
- Modify: `src/pages/WeekOverview.tsx`
- Test: `tests/edit-week.spec.ts`

**Interfaces:**
- Consumes: `applyEdits`, `applyOps`, `getProgramme` from the store/engine; `BottomSheet`.

- [ ] **Step 1: Write the failing spec**

Create `tests/edit-week.spec.ts`:

```ts
import { test, expect } from '@playwright/test';

test('move a day down reorders the week', async ({ page }) => {
  await page.goto('/week/1');
  await page.getByRole('button', { name: 'Day options for Day A: Lower Strength' }).click();
  await page.getByRole('button', { name: 'Move down' }).click();
  const cards = page.locator('main h3');
  await expect(cards.first()).not.toHaveText('Upper Push'); // Day B's name is "Upper Push" — now first
});

test('remove a day', async ({ page }) => {
  await page.goto('/week/1');
  await page.getByRole('button', { name: 'Day options for Day D: Upper Pull + Overhead' }).click();
  await page.getByRole('button', { name: 'Remove day' }).click();
  await page.getByRole('button', { name: 'Remove anyway' }).click();
  await expect(page.getByText('Upper Pull')).toHaveCount(0);
});
```

(Adjust the exact accessible names to the implementation; keep the behaviour.)

- [ ] **Step 2: Implement**

In `src/pages/WeekOverview.tsx`:

1. Imports: add `MoreVertical, ArrowUp, ArrowDown, Trash2` to lucide imports; `BottomSheet`; `applyEdits` from `../lib/programme/store`; `applyOps` from `../lib/programme/engine`; `getProgramme` from the store; `hapticSelect` from feedback; `PROGRESS_KEY` is already imported.
2. State in `WeekOverview`: `const [dayMenu, setDayMenu] = useState<WorkoutDay | null>(null);` and `const [confirmRemove, setConfirmRemove] = useState<string | null>(null);`.
3. In `DayCard`, add an optional `onMenu?: () => void` prop; when set, render an icon button (`aria-label={`Day options for ${day.title}`}`, `MoreVertical`, `relative z-10`, 8×8 round `bg-ink/10`) in the content header row next to the Start pill. Pass `onMenu={() => setDayMenu(day)}` from the parent map.
4. Render the sheet after the day cards:

```tsx
<BottomSheet open={dayMenu !== null} onClose={() => { setDayMenu(null); setConfirmRemove(null); }} title="Day options" subtitle={dayMenu?.title}>
  {dayMenu && (
    <div className="space-y-2">
      <div className="flex gap-2">
        <button
          onClick={() => {
            hapticSelect();
            const idx = week.days.findIndex((d) => d.id === dayMenu.id);
            applyEdits([{ type: 'move-day', dayId: dayMenu.id, toIndex: Math.max(0, idx - 1) }]);
            setDayMenu(null);
          }}
          className="flex-1 flex items-center justify-center gap-1.5 bg-ink/10 hover:bg-ink/20 font-bold text-sm py-3.5 rounded-xl transition-colors"
        >
          <ArrowUp className="w-4 h-4" /> Move up
        </button>
        <button
          onClick={() => {
            hapticSelect();
            const idx = week.days.findIndex((d) => d.id === dayMenu.id);
            applyEdits([{ type: 'move-day', dayId: dayMenu.id, toIndex: idx + 1 }]);
            setDayMenu(null);
          }}
          className="flex-1 flex items-center justify-center gap-1.5 bg-ink/10 hover:bg-ink/20 font-bold text-sm py-3.5 rounded-xl transition-colors"
        >
          <ArrowDown className="w-4 h-4" /> Move down
        </button>
      </div>
      {confirmRemove ? (
        <div className="bg-danger/10 rounded-xl px-4 py-3.5">
          <p className="text-sm font-bold text-danger text-center mb-3">{confirmRemove}</p>
          <button
            onClick={() => {
              hapticSelect();
              applyEdits([{ type: 'remove-day', dayId: dayMenu.id }]);
              setDayMenu(null);
              setConfirmRemove(null);
            }}
            className="w-full bg-danger text-ink font-bold text-sm py-3.5 rounded-xl transition-transform active:scale-[0.98]"
          >
            Remove anyway
          </button>
        </div>
      ) : (
        <button
          onClick={() => {
            hapticSelect();
            const dry = applyOps(getProgramme(), [{ type: 'remove-day', dayId: dayMenu.id }], completedSets);
            if (dry.ok && dry.warnings.length > 0) { setConfirmRemove(dry.warnings[0].message); return; }
            if (!dry.ok) { setConfirmRemove(dry.errors[0].message); return; }
            setConfirmRemove(`Remove ${dayMenu.title} from week ${week.weekNumber}?`);
          }}
          className="w-full flex items-center justify-center gap-1.5 bg-ink/10 hover:bg-ink/20 text-danger font-bold text-sm py-3.5 rounded-xl transition-colors"
        >
          <Trash2 className="w-4 h-4" /> Remove day
        </button>
      )}
    </div>
  )}
</BottomSheet>
```

Note `week` must come from `useWeeks()` (Task 5) so the page re-renders on apply.

- [ ] **Step 3: Run specs + suites**

Run: `npm run build && npx playwright test tests/edit-week.spec.ts && npx playwright test && npm run lint`
Expected: PASS.

- [ ] **Step 4: Commit**

```bash
git add src/pages/WeekOverview.tsx tests/edit-week.spec.ts
git commit -m "feat: move and remove days from the week overview"
```

---

### Task 8: Supabase project + `ai-coach` edge function

**Files:**
- Create: `supabase/functions/ai-coach/index.ts`
- Create: `supabase/functions/ai-coach/deno.json`
- Create: `supabase/config.toml` (via CLI init)
- Modify: `.gitignore` (add `supabase/.temp`)

**Interfaces:**
- Consumes: `ProposeEditsInputSchema`, `proposeEditsJsonSchema`, `WeekPayloadSchema` from `../../../src/lib/programme/ops.ts` (relative import across the repo — see note below).
- Produces (HTTP contract the client in Task 9 consumes):
  - `POST /functions/v1/ai-coach` with header `Authorization: Bearer <COACH_ACCESS_TOKEN>` and JSON body `{ action: 'chat', context: {...}, messages: [{role, content}] }` → `200 { text: string, proposal: { summary: string, ops: EditOp[] } | null }`
  - `{ action: 'generate', profile: Profile, weeksCount: number }` → `200 { name: string, weeks: WeekPayload[] }`
  - `401 { error: 'unauthorized' }` on bad/missing bearer; `400` on malformed body; `502 { error: string }` on upstream failure.

- [ ] **Step 1: HUMAN SETUP (Peter) — one-time, before implementation can be verified**

```bash
npx supabase login                 # opens browser
npx supabase init                  # creates supabase/ in the repo
npx supabase projects create strength-app --org-id <your-org>   # or create in dashboard
npx supabase link --project-ref <project-ref>
npx supabase secrets set ANTHROPIC_API_KEY=<key> COACH_ACCESS_TOKEN=<long-random-string>
```

Generate the access token with `openssl rand -hex 24`. Record `<project-ref>` — Task 9 hardcodes the functions URL.

- [ ] **Step 2: Implement the function**

Create `supabase/functions/ai-coach/deno.json`:

```json
{
  "imports": {
    "zod": "npm:zod@^4",
    "@anthropic-ai/sdk": "npm:@anthropic-ai/sdk"
  }
}
```

Create `supabase/functions/ai-coach/index.ts`:

```ts
// AI coach — the app's only backend. Holds the Anthropic key; phase A access
// control is a single bearer secret (Peter only). The client applies ops —
// this function never writes programme state.

import Anthropic from '@anthropic-ai/sdk';
import { z } from 'zod';
import {
  ProposeEditsInputSchema,
  proposeEditsJsonSchema,
  WeekPayloadSchema,
} from '../../../src/lib/programme/ops.ts';

const MODEL = 'claude-sonnet-5';

const CORS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), { status, headers: { ...CORS, 'Content-Type': 'application/json' } });

const SYSTEM = `You are the in-app strength coach for a volleyball-focused training PWA.
You adjust the user's programme through the propose_edits tool; your text explains the why, briefly.

Rules:
- Ground every suggestion in the user's profile (goals, sport context, equipment, schedule) and recent training history.
- Prefer the minimal ops that achieve the change. Use replace-day or replace-week only for genuine restructures (travel, equipment change, missed week).
- Target ids must come from the provided programme JSON — never invent ids. To keep an exercise's logged history in a replace payload, carry its existing id.
- Respect periodisation: taper leg volume and intensity in the 48-72h before a competition; keep movement intent (speed/power) when cutting volume.
- If the user asks something that needs no programme change, just answer — don't force an edit.
- One propose_edits call per reply at most, with a one-sentence summary.`;

const ChatBody = z.object({
  action: z.literal('chat'),
  context: z.object({
    profile: z.unknown().nullable(),
    programme: z.unknown(),
    currentWeek: z.number(),
    today: z.string(),
    recentWorkouts: z.array(z.unknown()).max(20),
    personalBests: z.unknown(),
  }),
  messages: z.array(z.object({ role: z.enum(['user', 'assistant']), content: z.string().min(1).max(4000) })).min(1).max(60),
});

const GenerateBody = z.object({
  action: z.literal('generate'),
  profile: z.object({
    goals: z.string().min(1),
    sportContext: z.string().optional(),
    equipment: z.array(z.string()),
    daysPerWeek: z.number().int().min(1).max(7),
    experience: z.enum(['beginner', 'intermediate', 'advanced']),
  }),
  weeksCount: z.number().int().min(4).max(16),
});

const GeneratedProgrammeSchema = z.object({
  name: z.string().min(1).max(60),
  weeks: z.array(WeekPayloadSchema).min(1).max(16),
});

async function handleChat(client: Anthropic, body: z.infer<typeof ChatBody>) {
  const contextBlock = [
    `Today: ${body.context.today}. Current week: ${body.context.currentWeek}.`,
    `Profile: ${body.context.profile ? JSON.stringify(body.context.profile) : 'not set — ask if goals/equipment matter to the request'}`,
    `Programme JSON (ids are authoritative): ${JSON.stringify(body.context.programme)}`,
    `Recent workouts: ${JSON.stringify(body.context.recentWorkouts)}`,
    `Personal bests: ${JSON.stringify(body.context.personalBests)}`,
  ].join('\n\n');

  const messages: Anthropic.MessageParam[] = [
    { role: 'user', content: contextBlock },
    { role: 'assistant', content: 'Understood — I have the programme and context. What would you like to adjust?' },
    ...body.messages.map((m) => ({ role: m.role, content: m.content })),
  ];

  const tool = {
    name: 'propose_edits',
    description:
      'Propose a batch of programme edit operations. The user reviews and applies them — nothing is applied automatically.',
    input_schema: proposeEditsJsonSchema() as Anthropic.Tool.InputSchema,
  };

  // Up to 2 validation retries: feed zod errors back as a tool_result error.
  for (let attempt = 0; attempt < 3; attempt++) {
    const response = await client.messages.create({
      model: MODEL,
      max_tokens: 16000,
      system: SYSTEM,
      tools: [tool],
      messages,
    });

    const text = response.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('\n')
      .trim();
    const toolUse = response.content.find((b): b is Anthropic.ToolUseBlock => b.type === 'tool_use');

    if (!toolUse) return { text, proposal: null };

    const parsed = ProposeEditsInputSchema.safeParse(toolUse.input);
    if (parsed.success) return { text, proposal: parsed.data };

    messages.push({ role: 'assistant', content: response.content });
    messages.push({
      role: 'user',
      content: [{
        type: 'tool_result',
        tool_use_id: toolUse.id,
        is_error: true,
        content: `Ops failed validation, fix and retry: ${JSON.stringify(parsed.error.issues.slice(0, 5))}`,
      }],
    });
  }
  return { text: 'I could not produce a valid edit for that — try rephrasing the request.', proposal: null };
}

async function handleGenerate(client: Anthropic, body: z.infer<typeof GenerateBody>) {
  const prompt = `Create a ${body.weeksCount}-week strength programme as JSON.

User profile:
- Goals: ${body.profile.goals}
- Sport context: ${body.profile.sportContext ?? 'none'}
- Equipment available: ${body.profile.equipment.join(', ') || 'full gym'}
- Training days per week: ${body.profile.daysPerWeek}
- Experience: ${body.profile.experience}

Requirements:
- Exactly ${body.profile.daysPerWeek} days per week (a final taper week may have fewer).
- Periodise into named blocks with block notes; include a one-line focus per week and a jumps/conditioning note when relevant to the sport context.
- reps is a string ("6", "6-8", "8/leg", "20 m"); load is a string ("70% TM", "RPE 7", "Bodyweight"); tracking is one of weighted/reps/time; restSec 0-900.
- Only prescribe exercises doable with the stated equipment.`;

  for (let attempt = 0; attempt < 2; attempt++) {
    const stream = client.messages.stream({
      model: MODEL,
      max_tokens: 64000,
      system: 'You are an expert strength and conditioning coach. Output only valid JSON matching the given schema.',
      output_config: { format: { type: 'json_schema', schema: z.toJSONSchema(GeneratedProgrammeSchema) } },
      messages: [{ role: 'user', content: prompt }],
    });
    const final = await stream.finalMessage();
    const text = final.content
      .filter((b): b is Anthropic.TextBlock => b.type === 'text')
      .map((b) => b.text)
      .join('');
    try {
      const parsed = GeneratedProgrammeSchema.safeParse(JSON.parse(text));
      if (parsed.success) return parsed.data;
    } catch {
      // fall through to retry
    }
  }
  throw new Error('generation did not produce a valid programme');
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: CORS });
  if (req.method !== 'POST') return json(405, { error: 'method not allowed' });

  const token = Deno.env.get('COACH_ACCESS_TOKEN');
  const auth = req.headers.get('authorization') ?? '';
  if (!token || auth !== `Bearer ${token}`) return json(401, { error: 'unauthorized' });

  let raw: unknown;
  try {
    raw = await req.json();
  } catch {
    return json(400, { error: 'invalid json' });
  }

  const client = new Anthropic({ apiKey: Deno.env.get('ANTHROPIC_API_KEY') });

  try {
    const chat = ChatBody.safeParse(raw);
    if (chat.success) return json(200, await handleChat(client, chat.data));
    const gen = GenerateBody.safeParse(raw);
    if (gen.success) return json(200, await handleGenerate(client, gen.data));
    return json(400, { error: 'unknown action' });
  } catch (e) {
    console.error(e);
    return json(502, { error: 'coach unavailable, try again' });
  }
});
```

Note on the cross-repo import: the Supabase CLI bundles from the entrypoint and follows relative imports, including ones above `supabase/functions/`. If `supabase functions deploy` rejects the `../../../src/...` import, copy `src/lib/programme/ops.ts` to `supabase/functions/_shared/ops.ts` verbatim, import from there, and add this sync-check to `src/lib/programme/ops.test.ts` so the copies can never drift:

```ts
import { readFileSync, existsSync } from 'node:fs';
it('edge-function copy of ops.ts is in sync', () => {
  const copy = 'supabase/functions/_shared/ops.ts';
  if (!existsSync(copy)) return; // direct import worked; no copy exists
  expect(readFileSync(copy, 'utf8')).toBe(readFileSync('src/lib/programme/ops.ts', 'utf8'));
});
```

Also note: Supabase functions receive a JWT-verification default — set `verify_jwt = false` for this function in `supabase/config.toml` (`[functions.ai-coach]` section), since access is bearer-secret gated instead.

- [ ] **Step 3: Verify locally, then deploy and verify live**

```bash
npx supabase functions serve ai-coach --env-file <(echo -e "ANTHROPIC_API_KEY=$ANTHROPIC_API_KEY\nCOACH_ACCESS_TOKEN=testtoken")
# in another shell:
curl -s -X POST http://127.0.0.1:54321/functions/v1/ai-coach -H "Authorization: Bearer wrong" -d '{}' | grep unauthorized
curl -s -X POST http://127.0.0.1:54321/functions/v1/ai-coach \
  -H "Authorization: Bearer testtoken" -H "Content-Type: application/json" \
  -d '{"action":"chat","context":{"profile":null,"programme":{"id":"p","weeks":[]},"currentWeek":1,"today":"2026-10-01","recentWorkouts":[],"personalBests":{}},"messages":[{"role":"user","content":"Say hi, no edits."}]}'
```

Expected: 401 for the wrong token; a `{ text, proposal: null }` reply for the greeting. Then:

```bash
npx supabase functions deploy ai-coach
```

Repeat the two curls against `https://<project-ref>.supabase.co/functions/v1/ai-coach` with the real token.

- [ ] **Step 4: Commit**

```bash
git add supabase/ .gitignore
git commit -m "feat: ai-coach supabase edge function (chat + generate)"
```

---

### Task 9: Client coach API + settings (token + training profile)

**Files:**
- Create: `src/lib/coach/config.ts`, `src/lib/coach/api.ts`
- Modify: `src/pages/ProfilePage.tsx`
- Test: `src/lib/coach/api.test.ts`

**Interfaces:**
- Consumes: `getProgramme`, `getProfile` from the store; `HISTORY_KEY`/`coerceHistory` from `../history`; `getBests` from `../bests`; the Task 8 HTTP contract.
- Produces:
  - `COACH_URL` constant (`src/lib/coach/config.ts`)
  - `COACH_TOKEN_KEY = 'vb-coach-token-v1'`, `getCoachToken()`, `saveCoachToken(t)`
  - `coachChat(messages: {role: 'user'|'assistant'; content: string}[]): Promise<{ text: string; proposal: ProposeEditsInput | null }>` — throws `CoachAuthError` on 401, `CoachError` otherwise
  - `coachGenerate(profile: Profile, weeksCount: number): Promise<{ name: string; weeks: unknown[] }>` (consumed by phase 3; built now because the function supports it)
  - ProfilePage gains a "Coach" preferences row (token entry sheet) and a "Training profile" row (goals/equipment/days/experience sheet writing `saveProfile`).

- [ ] **Step 1: Write the failing test** (`src/lib/coach/api.test.ts`, happy-dom env, mock `fetch` with `vi.stubGlobal`): assert that `coachChat` sends the bearer header from localStorage, includes `programme` and `today` in the context, returns the parsed body on 200, throws `CoachAuthError` on 401, and `CoachError` on 500.

```ts
// @vitest-environment happy-dom
import { describe, it, expect, vi, beforeEach } from 'vitest';

beforeEach(() => {
  localStorage.clear();
  vi.restoreAllMocks();
});

describe('coachChat', () => {
  it('sends bearer + context and returns the reply', async () => {
    localStorage.setItem('vb-coach-token-v1', 'tok');
    const { coachChat } = await import(`./api?t=${Math.random()}`);
    const fetchMock = vi.fn().mockResolvedValue(
      new Response(JSON.stringify({ text: 'hi', proposal: null }), { status: 200 })
    );
    vi.stubGlobal('fetch', fetchMock);
    const res = await coachChat([{ role: 'user', content: 'hello' }]);
    expect(res.text).toBe('hi');
    const [, init] = fetchMock.mock.calls[0];
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer tok');
    const body = JSON.parse(init.body as string);
    expect(body.action).toBe('chat');
    expect(body.context.programme.weeks.length).toBeGreaterThan(0);
  });

  it('throws CoachAuthError on 401', async () => {
    localStorage.setItem('vb-coach-token-v1', 'bad');
    const { coachChat, CoachAuthError } = await import(`./api?t=${Math.random()}`);
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(new Response('{}', { status: 401 })));
    await expect(coachChat([{ role: 'user', content: 'x' }])).rejects.toBeInstanceOf(CoachAuthError);
  });
});
```

- [ ] **Step 2: Implement**

`src/lib/coach/config.ts`:

```ts
// Public project URL (the secret is the bearer token, entered on-device).
// HUMAN STEP: replace <project-ref> with the ref from `npx supabase link`.
export const COACH_URL = 'https://<project-ref>.supabase.co/functions/v1/ai-coach';
```

`src/lib/coach/api.ts`:

```ts
import { getProgramme, getProfile } from '../programme/store';
import { ProposeEditsInput } from '../programme/ops';
import { Profile } from '../programme/types';
import { coerceHistory, HISTORY_KEY } from '../history';
import { getBests } from '../bests';
import { COACH_URL } from './config';

export const COACH_TOKEN_KEY = 'vb-coach-token-v1';

export class CoachError extends Error {}
export class CoachAuthError extends CoachError {}

export function getCoachToken(): string {
  try {
    return window.localStorage.getItem(COACH_TOKEN_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveCoachToken(token: string) {
  try {
    window.localStorage.setItem(COACH_TOKEN_KEY, token.trim());
  } catch {
    // ignore
  }
}

function readRecentWorkouts() {
  try {
    const raw = window.localStorage.getItem(HISTORY_KEY);
    const history = coerceHistory(raw ? JSON.parse(raw) : []);
    return [...history].sort((a, b) => b.completedAt - a.completedAt).slice(0, 10);
  } catch {
    return [];
  }
}

function currentWeekNumber(): number {
  // Mirrors HomePage: explicit override, else first incomplete week.
  try {
    const v = JSON.parse(window.localStorage.getItem('vb-current-week-v1') ?? 'null');
    if (typeof v === 'number') return v;
  } catch {
    // fall through
  }
  return 1;
}

async function post(body: unknown): Promise<Response> {
  const res = await fetch(COACH_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${getCoachToken()}` },
    body: JSON.stringify(body),
  });
  if (res.status === 401) throw new CoachAuthError('Coach access token is missing or wrong.');
  if (!res.ok) throw new CoachError(`Coach unavailable (${res.status}).`);
  return res;
}

export async function coachChat(
  messages: { role: 'user' | 'assistant'; content: string }[]
): Promise<{ text: string; proposal: ProposeEditsInput | null }> {
  const res = await post({
    action: 'chat',
    context: {
      profile: getProfile(),
      programme: getProgramme(),
      currentWeek: currentWeekNumber(),
      today: new Date().toISOString().slice(0, 10),
      recentWorkouts: readRecentWorkouts(),
      personalBests: getBests(),
    },
    messages,
  });
  return res.json();
}

export async function coachGenerate(profile: Profile, weeksCount: number) {
  const res = await post({ action: 'generate', profile, weeksCount });
  return res.json() as Promise<{ name: string; weeks: unknown[] }>;
}
```

- [ ] **Step 3: ProfilePage additions**

In the Preferences card (`ProfilePage.tsx`), add two rows following the existing Theme-row pattern (button row + `BottomSheet`):

1. **"Coach access"** row — shows "On" (primary, bold) when `getCoachToken()` is non-empty, else a "Set up" pill. Sheet: a password-type input (`aria-label="Coach access token"`), helper copy "Paste the access token from your Supabase secrets. Stored only on this device.", and a Save button calling `saveCoachToken` then closing.
2. **"Training profile"** row — shows `getProfile() ? 'Set' : 'Not set'`. Sheet with: goals (textarea), sport context (input), equipment (input, comma-separated, split/trimmed on save), days per week (chips 1–7), experience (3 chips). Save button calls `saveProfile({...})` and closes. Seed the form from `getProfile()` when opening. All labels sentence case.

Keep state in two `useState` sheets like `themeSheetOpen`; reuse the `field`/chip classes from Task 6's sheet.

- [ ] **Step 4: Run tests**

Run: `npm run test:unit && npm run lint && npm run build`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add src/lib/coach/ src/pages/ProfilePage.tsx
git commit -m "feat: coach client api, access token and training profile settings"
```

---

### Task 10: Coach chat screen with diff cards

**Files:**
- Create: `src/pages/CoachPage.tsx`
- Modify: `src/App.tsx` (route), `src/components/TabBar.tsx` (4th tab)
- Test: `tests/coach.spec.ts`

**Interfaces:**
- Consumes: `coachChat`, `CoachAuthError`, `getCoachToken`; `applyEdits`, `describeOps`, `getProgramme`, `undoLast`; `ProposeEditsInput`.
- Produces: route `/coach`; chat persisted at `vb-coach-chat-v1`.

- [ ] **Step 1: Write the failing spec** (`tests/coach.spec.ts`) using `page.route` to mock the function — no real network:

```ts
import { test, expect } from '@playwright/test';

const PROPOSAL = {
  text: 'Lightening Friday so your legs are fresh for Saturday.',
  proposal: {
    summary: 'Taper legs before the comp',
    ops: [{ type: 'update-exercise', exerciseId: 'w1-d1-e2', patch: { sets: 2, load: '60% TM' } }],
  },
};

test.beforeEach(async ({ page }) => {
  await page.goto('/');
  await page.evaluate(() => localStorage.setItem('vb-coach-token-v1', 'tok'));
});

test('a proposal renders a diff card; apply mutates the programme', async ({ page }) => {
  await page.route('**/functions/v1/ai-coach', (route) =>
    route.fulfill({ json: PROPOSAL })
  );
  await page.goto('/coach');
  await page.getByRole('textbox', { name: 'Message the coach' }).fill('Comp on Saturday, keep my legs fresh');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText('Taper legs before the comp')).toBeVisible();
  await expect(page.getByText(/Back Squat — 4×6 @ 70% TM → 2×6 @ 60% TM/)).toBeVisible();
  await page.getByRole('button', { name: 'Apply' }).click();
  await page.goto('/workout/w1-d1');
  await expect(page.getByText('2 × 6')).toBeVisible();
});

test('401 prompts for the access token', async ({ page }) => {
  await page.route('**/functions/v1/ai-coach', (route) => route.fulfill({ status: 401, json: { error: 'unauthorized' } }));
  await page.goto('/coach');
  await page.getByRole('textbox', { name: 'Message the coach' }).fill('hi');
  await page.getByRole('button', { name: 'Send' }).click();
  await expect(page.getByText(/access token/i)).toBeVisible();
});
```

Note: `w1-d1-e2` is Back Squat in week 1 (e1 is Hang Power Clean) — the diff line and the `2 × 6` assertion rely on the real seed.

- [ ] **Step 2: Implement CoachPage**

Create `src/pages/CoachPage.tsx`:

```tsx
import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { motion } from 'motion/react';
import { ArrowUp, Check, RotateCcw, Sparkles, X } from 'lucide-react';
import { cn } from '../lib/utils';
import { hapticSelect, hapticTap } from '../lib/feedback';
import { coachChat, CoachAuthError, getCoachToken } from '../lib/coach/api';
import { ProposeEditsInput } from '../lib/programme/ops';
import { describeOps } from '../lib/programme/describe';
import { applyEdits, getProgramme, undoLast, useProgramme } from '../lib/programme/store';

const CHAT_KEY = 'vb-coach-chat-v1';

type ChatMsg = {
  role: 'user' | 'assistant';
  content: string;
  proposal?: ProposeEditsInput | null;
  proposalState?: 'pending' | 'applied' | 'dismissed' | 'failed';
  diffLines?: string[];
  error?: string;
  at: number;
};

function loadChat(programmeId: string): ChatMsg[] {
  try {
    const raw = window.localStorage.getItem(CHAT_KEY);
    const parsed = raw ? (JSON.parse(raw) as { programmeId: string; messages: ChatMsg[] }) : null;
    if (parsed && parsed.programmeId === programmeId && Array.isArray(parsed.messages)) return parsed.messages;
  } catch {
    // corrupt chat history is disposable
  }
  return [];
}

function saveChat(programmeId: string, messages: ChatMsg[]) {
  try {
    window.localStorage.setItem(CHAT_KEY, JSON.stringify({ programmeId, messages: messages.slice(-50) }));
  } catch {
    // ignore
  }
}

export default function CoachPage() {
  const programme = useProgramme();
  const [messages, setMessages] = useState<ChatMsg[]>(() => loadChat(programme.id));
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const [authNeeded, setAuthNeeded] = useState(!getCoachToken());
  const endRef = useRef<HTMLDivElement>(null);

  useEffect(() => saveChat(programme.id, messages), [programme.id, messages]);
  useEffect(() => endRef.current?.scrollIntoView({ behavior: 'smooth' }), [messages.length, busy]);

  const send = async () => {
    const content = input.trim();
    if (!content || busy) return;
    hapticSelect();
    setInput('');
    const history = [...messages, { role: 'user' as const, content, at: Date.now() }];
    setMessages(history);
    setBusy(true);
    try {
      const reply = await coachChat(
        history.filter((m) => !m.error).map((m) => ({ role: m.role, content: m.content }))
      );
      const diffLines = reply.proposal ? describeOps(reply.proposal.ops, getProgramme()) : undefined;
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: reply.text, proposal: reply.proposal, proposalState: reply.proposal ? 'pending' : undefined, diffLines, at: Date.now() },
      ]);
      setAuthNeeded(false);
    } catch (e) {
      if (e instanceof CoachAuthError) setAuthNeeded(true);
      setMessages((prev) => [
        ...prev,
        { role: 'assistant', content: '', error: e instanceof CoachAuthError ? 'Your coach access token is missing or wrong — set it in Profile.' : 'The coach is unreachable right now — try again.', at: Date.now() },
      ]);
    } finally {
      setBusy(false);
    }
  };

  const applyProposal = (index: number) => {
    const msg = messages[index];
    if (!msg.proposal) return;
    hapticSelect();
    const res = applyEdits(msg.proposal.ops);
    setMessages((prev) =>
      prev.map((m, i) =>
        i === index
          ? { ...m, proposalState: res.ok ? 'applied' : 'failed', error: res.ok ? undefined : `Couldn't apply: ${res.errors[0].message}` }
          : m
      )
    );
  };

  const dismissProposal = (index: number) => {
    hapticTap();
    setMessages((prev) => prev.map((m, i) => (i === index ? { ...m, proposalState: 'dismissed' } : m)));
  };

  return (
    <div className="min-h-screen flex flex-col">
      <header className="bg-surface/90 backdrop-blur-md border-b border-ink/10 sticky top-0 z-20">
        <div className="max-w-xl mx-auto px-5 py-4 flex items-center gap-2.5">
          <Sparkles className="w-5 h-5 text-accent" />
          <div>
            <h1 className="text-lg font-bold tracking-[-0.02em] leading-tight">Coach</h1>
            <p className="text-[0.6875rem] font-bold text-secondary">Edits your programme with you</p>
          </div>
        </div>
      </header>

      <main className="max-w-xl mx-auto w-full px-5 py-5 flex-1 pb-44">
        {messages.length === 0 && (
          <div className="text-sm text-secondary leading-relaxed space-y-3 mt-6">
            <p>Tell the coach what's going on and it proposes programme edits you can apply with one tap. Try:</p>
            <ul className="space-y-2">
              <li className="bg-ink/5 rounded-xl px-3.5 py-2.5">"I'm travelling next week with only dumbbells — replan my week."</li>
              <li className="bg-ink/5 rounded-xl px-3.5 py-2.5">"Comp on Saturday and extra court time — keep my legs fresh."</li>
            </ul>
          </div>
        )}

        <div className="space-y-4">
          {messages.map((msg, i) => (
            <div key={msg.at + i} className={cn('flex', msg.role === 'user' ? 'justify-end' : 'justify-start')}>
              <div className={cn('max-w-[85%] space-y-2')}>
                {(msg.content || msg.error) && (
                  <div
                    className={cn(
                      'rounded-2xl px-4 py-3 text-sm leading-relaxed',
                      msg.role === 'user' ? 'bg-primary text-onfill' : msg.error ? 'bg-danger/10 text-danger font-medium' : 'bg-ink/10'
                    )}
                  >
                    {msg.error ?? msg.content}
                  </div>
                )}

                {msg.proposal && (
                  <div className="bg-surface-deep border border-ink/15 rounded-2xl px-4 py-3.5">
                    <p className="text-[0.6875rem] font-bold text-secondary mb-1">Proposed edit</p>
                    <p className="font-bold text-sm leading-snug">{msg.proposal.summary}</p>
                    <ul className="mt-2.5 space-y-1.5">
                      {(msg.diffLines ?? []).map((line) => (
                        <li key={line} className="text-xs text-ink/85 leading-relaxed border-l-2 border-accent pl-2.5">{line}</li>
                      ))}
                    </ul>
                    {msg.proposalState === 'pending' && (
                      <div className="flex gap-2 mt-3.5">
                        <button onClick={() => applyProposal(i)} className="flex-1 flex items-center justify-center gap-1.5 bg-primary text-onfill font-bold text-sm py-2.5 rounded-xl transition-transform active:scale-[0.98]">
                          <Check className="w-4 h-4" strokeWidth={3} /> Apply
                        </button>
                        <button onClick={() => dismissProposal(i)} className="flex-1 flex items-center justify-center gap-1.5 bg-ink/10 hover:bg-ink/20 font-bold text-sm py-2.5 rounded-xl transition-colors">
                          <X className="w-4 h-4" /> Dismiss
                        </button>
                      </div>
                    )}
                    {msg.proposalState === 'applied' && (
                      <div className="flex items-center justify-between mt-3.5">
                        <p className="text-xs font-bold text-primary flex items-center gap-1.5"><Check className="w-3.5 h-3.5" strokeWidth={3} /> Applied</p>
                        <button onClick={() => { hapticTap(); undoLast(); dismissProposal(i); }} className="flex items-center gap-1 text-xs font-bold text-secondary hover:text-ink transition-colors">
                          <RotateCcw className="w-3.5 h-3.5" /> Undo
                        </button>
                      </div>
                    )}
                    {msg.proposalState === 'dismissed' && <p className="text-xs font-bold text-secondary mt-3.5">Dismissed</p>}
                    {msg.proposalState === 'failed' && <p className="text-xs font-bold text-danger mt-3.5">{msg.error}</p>}
                  </div>
                )}
              </div>
            </div>
          ))}
          {busy && (
            <motion.p initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="text-sm text-secondary font-medium">
              Coach is thinking…
            </motion.p>
          )}
        </div>
        <div ref={endRef} />

        {authNeeded && (
          <div className="mt-5 bg-accent/10 rounded-2xl px-4 py-3.5 text-sm leading-relaxed">
            The coach needs an access token —{' '}
            <Link to="/profile" className="font-bold underline">set it in Profile</Link>.
          </div>
        )}
      </main>

      <div className="fixed bottom-20 inset-x-4 z-30">
        <div className="max-w-xl mx-auto flex items-end gap-2 bg-surface-deep/95 backdrop-blur-md border border-ink/15 rounded-3xl p-2 shadow-xl">
          <textarea
            aria-label="Message the coach"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && !e.shiftKey) {
                e.preventDefault();
                void send();
              }
            }}
            rows={1}
            placeholder="Ask the coach…"
            className="flex-1 bg-transparent resize-none px-3 py-2.5 text-sm text-ink placeholder:text-secondary focus:outline-none max-h-32"
          />
          <button
            onClick={() => void send()}
            disabled={busy || !input.trim()}
            aria-label="Send"
            className="w-10 h-10 flex-shrink-0 rounded-full bg-primary text-onfill flex items-center justify-center transition-transform active:scale-95 disabled:opacity-40"
          >
            <ArrowUp className="w-5 h-5" strokeWidth={2.5} />
          </button>
        </div>
      </div>
    </div>
  );
}
```

- [ ] **Step 3: Route + tab**

- `src/App.tsx`: `import CoachPage from './pages/CoachPage';` and add `<Route path="/coach" element={<CoachPage />} />`.
- `src/components/TabBar.tsx`: add `'/coach'` to `isTabBarRoute`; add to `TABS` (after Programme): `{ to: '/coach', label: 'Coach', icon: Sparkles, isActive: (p: string) => p === '/coach' }` (import `Sparkles` from lucide); change the container class `grid-cols-3` → `grid-cols-4`.

- [ ] **Step 4: Run specs + suites**

Run: `npm run build && npx playwright test tests/coach.spec.ts && npx playwright test && npm run lint && npm run test:unit`
Expected: all PASS.

- [ ] **Step 5: Commit**

```bash
git add src/pages/CoachPage.tsx src/App.tsx src/components/TabBar.tsx tests/coach.spec.ts
git commit -m "feat: coach chat with proposal diff cards, apply/dismiss/undo"
```

---

### Task 11: Migration-safety Playwright spec + CI unit tests + docs

**Files:**
- Test: `tests/programme-migration.spec.ts`
- Modify: `.github/workflows/deploy.yml` (run unit tests before build)

- [ ] **Step 1: Write the migration spec** — the highest-stakes behaviour in the release (existing users must lose nothing):

```ts
import { test, expect } from '@playwright/test';

test('existing logged progress survives the programme-store migration', async ({ page }) => {
  await page.goto('/');
  // Simulate a pre-migration user: logged sets + history, NO vb-programme-v1.
  await page.evaluate(() => {
    localStorage.clear();
    localStorage.setItem('volleyball-workout-progress-v3', JSON.stringify({
      'w1-d1-e2-0': { completed: true, weight: '80', actualReps: '6' },
    }));
  });
  await page.reload();
  await page.goto('/workout/w1-d1');
  // The logged set renders completed with its weight.
  await expect(page.locator('input[value="80"]')).toBeVisible();
  // And the programme store now exists with the seed ids.
  const programme = await page.evaluate(() => JSON.parse(localStorage.getItem('vb-programme-v1')!));
  expect(programme.weeks[0].days[0].exercises[1].id).toBe('w1-d1-e2');
});
```

- [ ] **Step 2: CI** — in `.github/workflows/deploy.yml`, after `npm ci` add a step `run: npm run test:unit` (before the build step).

- [ ] **Step 3: Run everything**

Run: `npm run lint && npm run test:unit && npm run build && npx playwright test`
Expected: green across the board.

- [ ] **Step 4: Commit**

```bash
git add tests/programme-migration.spec.ts .github/workflows/deploy.yml
git commit -m "test: migration safety spec, unit tests in CI"
```

---

## Out of scope for this plan (later plans)

- Onboarding wizard + generation preview/accept UI (spec §4 — phase 3; `coachGenerate` and the `generate` route are already built and verified by curl).
- Supabase auth, credits tables, Stripe (spec §5 phases B/C — separate spec).
- Programme archive/restore UI beyond the `installProgramme` hook.
