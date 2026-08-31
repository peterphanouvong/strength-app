# Gauntlet Answer Key — pass/fail criteria per unit

Critics judge ONLY against this document plus the named reference images. If a criterion
is not listed here, it is not a failure. Every criterion must be verifiable from artifacts
alone: screenshots at 390×844, Playwright output, localStorage JSON dumps, build output.

## Ground truth (frozen facts critics may rely on)

**Routes:** `/` (weeks list), `/week/:weekNumber`, `/workout/:id` (day ids like `w1-d1`),
`/complete/:id`.

**localStorage contract (MUST NOT change key names or value shapes):**

| Key | Shape |
|---|---|
| `volleyball-workout-progress-v3` | `Record<"{exerciseId}-{setIndex}", {completed: boolean, weight?: string, actualReps?: string, timeSec?: string, setType?: 'W'\|'F'\|'D'}>` — exercise ids like `w1-d1-e2`, setIndex 0-based |
| `vb-active-session-v1` | `{dayId: string, startedAt: number}` |
| `vb-rest-overrides-v1` | `Record<exerciseName, seconds>` |

**Design system (frozen):** background `court #2a2ae0`, recessed `court-deep #1e1eb8`,
accents `flame #ff3d2e` / `mint #7bf1a8` (progress + done) / `zest #f7e353` (meta highlights) /
`mist #b9b9f2` (secondary text). Font: Space Grotesk only. Negative tracking on display type.
**No letterspaced uppercase labels** (uppercase display words with tight/negative tracking are
fine and part of the poster style; `tracking-wide`+uppercase eyebrows are a FAIL).

**Programme content (frozen):** `src/data.ts` prescriptions (sets/reps/loads/notes/rest
suggestions/focus/block notes) must be byte-identical in meaning. Any diff to prescription
values = automatic unit FAIL regardless of other criteria.

**Canonical fixture arithmetic (for F1/F4/F7 and V3/V4 seeds):**
Week 1 Day A = `w1-d1`: Hang Power Clean 5×3 (weighted), Back Squat 4×6 (weighted),
Bulgarian Split Squat 3×8/leg (weighted), Hanging Knee Raise 3×10 (reps). **Total sets = 15.**
If the fixture logs HPC 5 sets @ 60 kg×3, Squat 4 @ 80×6, BSS 3 @ 20×8, HKR 3 @ 10 reps:
**volume = 5·60·3 + 4·80·6 + 3·20·8 = 900+1920+480 = 3300 kg** (reps-tracked sets add 0).
Completion screen must show Sets `15/15` and Volume `3,300 kg` for this fixture.

## Deterministic gate (runs before ANY critic; all must pass or the round is an automatic FAIL)

1. `npx tsc --noEmit` — exit 0.
2. `npm run build` — exit 0, PWA precache generated.
3. `npx playwright test` — all existing specs green.
4. `git diff` on `src/data.ts` shows no changes to prescription values (structure-only refactors allowed).

---

## V-units — visual. Bar: blind A/B at 390×844 against the named reference + criteria below.

Blind A/B protocol: critic receives two screenshots labelled [A]/[B] (assignment randomized,
labels stripped of any builder identity) plus the reference image. Verdict = binary pick per
criterion + one-line evidence citing what is visible in the pixels. The candidate PASSES the
round only if it wins the overall pick AND has no criterion marked "clearly worse than reference
quality bar". When comparing before/after of our own app, the pick answers: "which looks more
like it shipped from the studio that made the reference?"

### V1 — weeks list (`/`)
Reference: `docs/design-refs/GO Club iOS Plan/*.png` (ultramarine ground, oversized display
type, zest/mint/white surfaces, generous air).
- [ ] Hero display type is confident and tight (≥2.5rem, negative tracking, no orphan clutter).
- [ ] Three block sections visually distinct with their accent colors (Rebuild/flame, Load/zest, Convert/mint) and read as one designed system, not three random styles.
- [ ] Week rows: clear hierarchy (week number > focus line), progress state legible at a glance (empty vs % vs done-check).
- [ ] Spacing rhythm consistent (equal gaps within a block; no cramped or double-gap seams).
- [ ] Nothing letterspaced-uppercase; palette only from the five tokens + white/opacity tints.
- [ ] Touch targets ≥44px tall; no text truncated mid-word at 390px.

### V2 — week detail (`/week/1`)
Reference: GO Club Plan set (poster panels, chip tabs) — same bar as V1.
- [ ] Poster day-cards read as a set: aligned panels, consistent word-stacking, no awkward wraps at 390px.
- [ ] Info tabs look like chips (selected state unmistakable), content swap is not jarring.
- [ ] Day-card meta (exercise count · sets, progress bar, Start/Resume/done states) legible and consistent with V1's progress language.
- [ ] Back button + block label top bar aligned to the same grid as content.

### V3 — workout session (`/workout/w1-d1`, fixture partially logged)
Reference: `docs/design-refs/hevy-exercise-history-list.png` for the logging-table idiom
(SET / previous / weight / reps columns) translated into our palette; GO Club for chrome.
- [ ] Sticky header: title, week/day meta, Finish action, live progress bar — all readable over content when scrolled.
- [ ] Set table columns align across all exercises (Set / Previous / kg / Reps / ✓ share one grid); inputs are obviously tappable fields.
- [ ] Completed rows read instantly (mint wash + filled check) vs pending rows; set-type letters (W/F/D) colored zest/flame/mist.
- [ ] Stats row (Duration/Volume/Sets) has equal card sizing and doesn't jitter as values change (tabular numerals).
- [ ] Exercise sections have clear rhythm: name > load > notes > rest chip > table, with consistent inter-exercise spacing.

### V4 — completion screen (`/complete/w1-d1` with the canonical fixture state)
Reference: `docs/design-refs/Hevy iOS Editing a poster background/…0.png` (Nice work! + stat
card + Done) — celebratory, stat-forward.
- [ ] Display headline is the hero; stat card (Duration/Volume/Sets) reads as one designed object on zest.
- [ ] Stats match fixture arithmetic exactly (15/15, 3,300 kg).
- [ ] Share + Done + back actions have clear primary/secondary/tertiary hierarchy.
- [ ] Confetti (if shown) uses only palette colors and never blocks interaction.

### V5 — bottom sheets (set type / rest config / exercise history)
Reference: Hevy history list for the history sheet content; GO Club chrome for sheet styling.
- [ ] All three sheets share one anatomy: grabber, centered title, same radius/padding/scrim.
- [ ] Set-type rows: letter colored by type, label + hint hierarchy, selected state shows check.
- [ ] Rest grid: selected duration unmistakable (mint fill); "Off" reads as an option, not an error.
- [ ] History sheet: chart (when ≥2 weighted weeks) + per-week set rows, most recent first, prescriptions as meta — visually parallel to Hevy's SET/WEIGHT×REPS list.
- [ ] Sheets fit 390×844 without the title or first content row clipped; long content scrolls inside the sheet.

### V6 — rest countdown bar + active-workout pill
Reference: quality bar = GO Club floating tab pill (screenshot bottom): floating, rounded-full, shadowed, alive.
- [ ] Rest bar: label, mm:ss countdown, +15s, skip, progress track — one row, nothing crowded at 390px.
- [ ] Countdown numerals tabular (no width jitter between ticks — two screenshots 1s apart must not shift layout).
- [ ] Pill: pulsing live dot + title + elapsed, floats clear of content, hidden on its own workout page and completion page.
- [ ] Both use spring entrance/exit (artifact: video/two screenshots showing offscreen→rest position), never overlap each other illegibly.

---

## F-units — functional. Bar: the listed Playwright assertions green + criteria below.
Each F-unit's spec file must run against the production build (`npm run build && npm run preview`),
seed localStorage BEFORE app load, and use only public behavior (visible text, roles, storage state).

### F1 — full workout flow
- [ ] Start at `/week/1`, open Day A, tick every set of all 4 exercises entering weights per the canonical fixture, tap Finish.
- [ ] Lands on `/complete/w1-d1`; Sets shows `15/15`, Volume shows `3,300 kg`; Duration shows a plausible mm:ss (not 0:00 frozen, not NaN).
- [ ] `vb-active-session-v1` is removed after Finish; progress key contains 15 entries with `completed: true`.
- [ ] Finishing with 0 sets ticked navigates back to the week (no completion screen, no session left behind).

### F2 — rest timer lifecycle
- [ ] Ticking a set with restSec > 0 shows the rest bar with that exercise's name and its configured duration.
- [ ] +15s adds exactly 15s to remaining (assert via displayed value before/after within tolerance 1s).
- [ ] Skip (X) dismisses immediately.
- [ ] Expiry: bar auto-dismisses when countdown reaches 0 (use a short override e.g. 30s via `vb-rest-overrides-v1` seed, or clock control).
- [ ] Un-ticking a set does NOT start a rest timer.
- [ ] Changing rest duration in the sheet persists in `vb-rest-overrides-v1` and is used for the next tick; "Off" (0) starts no timer.

### F3 — session conflict
- [ ] Seed `vb-active-session-v1` for `w1-d1`, navigate to `/workout/w1-d2` → conflict sheet appears naming Day A ("Lower Strength") and its running minutes.
- [ ] "Go back to that workout" → lands on `/workout/w1-d1`, session key unchanged.
- [ ] "End it and start this one" → sheet closes, session key now `dayId: 'w1-d2'`, timer runs from ~0.
- [ ] Same-day navigation (`w1-d1` active → open `w1-d1`) shows NO conflict sheet and keeps startedAt (timer resumes, not resets).

### F4 — exercise history + progression placeholders
- [ ] Seed 3 weeks of completed Back Squat logs (w1/w2/w3, distinct weights e.g. 80/85/90). On `/workout/w4-d1`, Back Squat's "Previous" column and input placeholders show week-3 values (most recent prior completed).
- [ ] History sheet for Back Squat lists weeks 3,2,1 in that order with `{weight} kg × {reps}` rows and per-week prescription meta.
- [ ] Chart appears (≥2 weighted weeks) and its "Heaviest set" callout names 90 kg, week 3.
- [ ] An exercise with no logs shows the empty-state copy, not a blank sheet.
- [ ] Week 1 (no priors) shows placeholder fallback (target reps / — for weight), never crashes.

### F5 — set types
- [ ] Tapping a set-number opens the type sheet; choosing W/F/D writes `setType` into the progress key; choosing Normal removes it.
- [ ] The letter (colored) replaces the set number in the row; survives full reload.
- [ ] Completed sets with a type show the letter in the history sheet with matching color class.

### F6 — PWA integrity
- [ ] `dist/manifest.webmanifest` parses; name, short_name, theme_color `#2a2ae0`, display standalone, 192/512/maskable icons present in dist and returning 200.
- [ ] Service worker registers on preview; precache includes the app shell (index.html, JS, CSS).
- [ ] Offline: with SW active and network offline (Playwright context.setOffline), `/`, `/week/1`, `/workout/w1-d1`, `/complete/w1-d1` all render app UI (not browser error page). SPA deep links must fall back to the app shell.
- [ ] App renders correctly offline even if Google Fonts fails (fallback font acceptable offline; no infinite spinner/blank).

### F7 — data safety
- [ ] Storage keys/shapes after any refactor exactly match the Ground-truth table (spec asserts JSON shape from a seeded fixture round-trips through the UI unchanged apart from user edits).
- [ ] Mid-workout reload: tick 5 sets with weights, reload the page → all 5 ticks, weights, elapsed session timer (still counting from original startedAt), and rest overrides intact.
- [ ] A legacy-shaped progress blob (extra unknown fields) does not crash any page and unknown fields are not destroyed by an unrelated set edit… OR (acceptable) unknown fields on OTHER set entries are preserved; the edited entry may be rewritten.
- [ ] Corrupt JSON in any of the three keys → app renders with defaults, no white screen (console errors allowed, crash not).

---

## Q-units

### Q1 — adversarial code review sweep
- [ ] Finding = a demonstrable bug: incorrect behavior reachable from the UI, data loss, race, or crash — with a repro path. Style nits, "could be cleaner", and hypotheticals without repro are NOT findings.
- [ ] Every finding independently verified by a skeptic (fresh context) who attempts to refute it; only confirmed findings get fixed.
- [ ] Each fix lands with a Playwright or unit assertion that fails before / passes after.
- [ ] Zero regressions: full gate green after fixes.

### Q2 — performance & installability
- [ ] Lighthouse (mobile emulation, production preview): Performance ≥ 90, Accessibility ≥ 95.
- [ ] PWA installable (manifest + SW + icons pass Lighthouse/Chrome installability checks).
- [ ] Main JS bundle < 500 kB gzipped (baseline today: 143 kB — do not regress past 200 kB without a recorded reason).
- [ ] No new runtime dependency beyond @playwright/test without a recorded justification in the report.

---

## SMOOTH pass (after all units)
- [ ] One fresh agent sweeps all screens for cross-unit drift: spacing scale, border radii, copy voice (sentence case, no exclamation-mark spam), motion durations/springs, progress-bar heights.
- [ ] No redesigns: diffs limited to reconciling values that already exist elsewhere in the app.
- [ ] Full deterministic gate green, then one final critic pass over the all-screens shot set with this key.
