# Consumer flows: tabs, browse-first workouts, cancel, save/congrats, PRs, share preview

**Date:** 2026-09-05 · **Status:** approved (Peter, in-chat) · **Branch:** `feature/consumer-flows`

Peter's 8 asks, verbatim mapping: (1) no auto-start on open, (2) cancel/stop a workout,
(3) browse prebuilt workouts freely, (4) bottom tab navigation, (5) "best" (PR) indicators,
(6) a Save/Finish screen before congrats+share, (7) share preview before sharing,
(8) post-completion calendar + streak congratulation.

Approved decisions: keep the GO Club design system (Hevy shots are **feature** refs only);
tabs = **Home / Programme / Profile**; **skip the muscle-distribution radar**; cancel's primary
action **keeps logged sets** (discard is secondary); PR badges cover **weighted + reps** tracking
only (time-tracked excluded — `data.ts` has no lower-is-better flag and sprints must not celebrate
slower times).

## Hard constraints (unchanged from the gauntlet)

- `src/data.ts` prescriptions frozen; refactor-free.
- Existing localStorage keys/shapes unchanged: `volleyball-workout-progress-v3`,
  `vb-active-session-v1`, `vb-rest-overrides-v1`. New storage is **new keys only**.
- Design system fixed: court `#2a2ae0` / court-deep / flame / mint / zest / mist + white tints,
  Space Grotesk, tight tracking, no letterspaced-uppercase labels.
- No new runtime dependencies. Full Playwright suite stays green; new features get new specs.

## Data model (additive)

```ts
// vb-workout-history-v1 : CompletedWorkout[]
type CompletedWorkout = {
  id: string;            // uuid-ish: `${dayId}-${completedAt}`
  dayId: string; weekNum: number; dayTitle: string;
  completedAt: number;   // epoch ms, written at Save
  elapsed: number;       // seconds
  volume: number;        // kg
  setsDone: number; totalSets: number;
  note?: string; title?: string;  // user-edited on Save screen
};

// vb-personal-bests-v1 : Record<exerciseName, PersonalBest>
type PersonalBest = {
  bestWeight?: { weight: number; reps: number; dayId: string; at: number };
  bestReps?: { reps: number; dayId: string; at: number };   // reps-tracked exercises
};
```

New lib: `src/lib/history.ts` (read/write history, month grid + streak derivation),
`src/lib/bests.ts` (read/update PRs, "is this set a new best?" check).
Streak definition: consecutive **calendar weeks** (Mon-start) containing ≥1 saved workout, counted
backward starting from the current week — except the current week may be empty without breaking the
streak (grace: you haven't failed this week until it ends). A fully empty prior week breaks it.
Displayed as "N week streak" with flame.

## Navigation & lifecycle

Routes: `/` Home dashboard · `/programme` weeks browser (today's `/`) · `/week/:n` ·
`/workout/:id` · `/complete/:id` (save screen) · `/congrats/:id` · `/profile`.
Old `/` behavior moves to `/programme`; `/` becomes Home. No redirects needed (fresh local app),
but unknown routes keep not-found handling.

**TabBar** (new component): Home / Programme / Profile, GO Club styling (floating rounded bar,
court-deep surface, mint active icon+label, sentence case). Visible on `/`, `/programme`,
`/week/:n`, `/profile`. Hidden on `/workout/:id`, `/complete/:id`, `/congrats/:id` (full-screen
focus). ActiveWorkoutPill floats above the TabBar (stacked, not overlapping) and keeps its
current visibility rules.

**Browse-first WorkoutPage.** Opening `/workout/:id` no longer starts a session (kills auto-start,
enables browsing). Two modes:
- **Preview** (no active session for this day): full exercise plan visible, inputs disabled or
  read-only, sticky **Start workout** CTA (mint, bottom). No writes to any storage. Header shows
  "Preview" state, no Finish button, no duration ticking.
- **Live** (session exists for this day): exactly today's behavior. Tapping Start switches modes
  by calling `startSession(dayId)`. Convenience: in preview, tapping a set's check both starts the
  session and logs that set (one-tap flow preserved for people who just start lifting).
- Session conflict moves to the **Start** action (and the set-tap-start convenience): browsing
  another day while a workout runs never raises the sheet — only attempting to START it does.
  The conflict sheet gains a third action:
  **"Discard the other workout"** (ends it AND clears its logged sets for that day, then starts
  this one). Existing two actions unchanged.

**Cancel (live mode).** `⋮` button in the live header opens a sheet:
- **End workout, keep sets** (primary, mint) — `endSession()`, back to `/week/:n`; day stays
  resumable with its progress.
- **Discard workout** (destructive, flame text) — confirm inline ("This clears N logged sets"),
  then `endSession()` + delete this day's entries from the progress map, back to `/week/:n`.

## Completion flow

**Finish → `/complete/:id` becomes the Save screen** (replaces jump-straight-to-congrats):
day title (editable text input, default = day name), optional note textarea, stat row
(Duration / Volume / Sets, zest card as today), **Save workout** (mint primary) and
**Discard workout** (flame text, confirm inline — a true discard: ends the session AND clears this
day's logged sets, nothing written to history; identical semantics to cancel's "Discard workout"),
back arrow returns to the live workout
(session must NOT be ended by Finish anymore — it ends at Save/Discard so back is lossless).
- On **Save**: end session, append `CompletedWorkout` to history, update PRs from this workout's
  logged sets, navigate to `/congrats/:id`.

**`/congrats/:id`** (new page, replaces old celebration): confetti + "Nice work." headline as
today, stat card, then the **month calendar** (current month grid, saved-workout days as mint
discs, today ringed) + **streak line** ("🔥 N week streak" in flame/zest, sentence case) +
context-aware congratulation copy (first save vs streak continuing vs streak started).
Buttons: **Share** (opens share preview sheet), **Done** → `/week/:n`.
Calendar + streak render from `vb-workout-history-v1` via `src/lib/history.ts`; the same
`<MonthCalendar>` component is reused on Profile.

## Home & Profile

**Home `/`**: greeting; **current week card** (first week with incomplete sets — same "resume
point" heuristic as data allows) linking to `/week/:n`; active/resumable session card ("Jump back
in") when one exists; streak chip; up to 3 recent PRs ("Back Squat · 90 kg × 6"). Lean by design.

**Profile `/profile`**: month calendar (navigable prev/next month), streak, workout history list
(most recent first: title, week/day, date, duration/volume/sets), full PR list, and the
rest-notification permission control (moved copy of the one in the rest sheet — sheet keeps its
inline prompt). No auth, no avatar — it's a local single-user app.

## PR badges (live mode)

On completing a set (tick): if weighted and `weight > bestWeight.weight` (tie-break: higher reps
at same weight), or reps-tracked and `reps > bestReps.reps` → rosette/medal glyph appears on the
set row (zest), `hapticExerciseDone`-tier haptic + a distinct "best" pop animation, and the best
is stored immediately. Un-ticking the set does NOT revoke the stored best (keep it simple;
history is the source of truth at Save). Seeding: on first run, bests bootstrap lazily from
existing progress map so long-time data counts.

## Share preview (item 7)

`shareWorkout` currently generates + shares immediately. New flow: **Share** button renders the
share card image into a BottomSheet preview (`<img>` of the generated canvas), with
**Share** / **Save image** / **Close**. Share uses navigator.share when available, else download —
same fallbacks as today, just behind the preview.

## Testing

Per phase, new Playwright specs (same harness/fixtures conventions):
- `tests/a-navigation.spec.ts` — tabs show/hide per route; browse-first (no session key written on
  open; Start writes it; set-tap starts+logs); cancel keep/discard semantics; conflict third action.
- `tests/b-completion.spec.ts` — Finish keeps session; Save writes history + ends session +
  lands on congrats; calendar shows saved day mint; streak math (fixture with 3 weeks of history);
  discard path; back-from-save returns to live workout losslessly.
- `tests/c-prs-share.spec.ts` — PR badge on beating seeded best; no badge on equal/lower; reps PR;
  time-tracked never badges; share preview sheet appears before any share/download.
- Existing 66 tests must stay green **except** tests asserting the old lifecycle (e.g. F1's
  "session starts on open", old `/complete` layout): those are updated to the new approved
  behavior — behavior assertions are *changed to match the spec*, never weakened. Every such
  change is listed in the phase commit message.

## Phases

- **A** — TabBar, Home (skeleton), Profile (skeleton), route moves, browse-first WorkoutPage,
  cancel sheet, conflict third action. App fully usable at phase end.
- **B** — history lib + Save screen + congrats page with calendar/streak, Profile filled in.
- **C** — bests lib + PR badges + share preview sheet. Home recent-PRs slot filled.

Each phase: build → deterministic gate (tsc/build/full suite) → fresh critic against this spec →
commit. Merge `feature/consumer-flows` → `main` after the final all-screens pass.
