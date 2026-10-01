# Programme editing engine + AI coach — design

**Date:** 2026-10-01
**Status:** Approved design, pre-implementation
**Supersedes:** amends the "prescriptions are frozen" rule in `2026-09-05-consumer-flows-design.md` — the programme becomes user-owned data; `src/data.ts` remains frozen as the seed template only.

## Intent

Let users personalise and edit their programme at three levels — the whole programme (macro), a week, and a single workout (micro) — manually for those who want control, and through an in-app AI coach for everyone else. Driving use cases (Peter's, this week):

- **Travel:** "I'm in Perth with only dumbbells and a bench — what should I do this week given my goals?"
- **Load management:** "Volleyball comp Saturday and more court volume this week — adjust training so my legs are fresh."

Also: make the app usable by anyone — an onboarding intake (goals, equipment, days/week, experience) generates a personal programme via AI, which they then adapt on the fly.

**Success for v1:** Peter can describe Perth or Saturday's comp in the app and get a sensibly adjusted week, applied with one tap, undoable.

## Decisions made with Peter

| Decision | Choice |
| --- | --- |
| Backend platform | Supabase (auth + Postgres + edge functions) — also the home for the roadmap auth/sync item |
| v1 access | Peter only, via a shared bearer secret; no public exposure |
| Monetisation direction | Token/credit system: one free AI-generated initial plan; paid credits for further AI edits. Schema designed now, built in later phases |
| Edit representation | Typed domain operations with coarse `replace-day` / `replace-week` ops (approach A) — not whole-JSON replacement, not RFC 6902 |
| Manual edit UI scope | Light: exercise-level CRUD + skip/move day. Structural restructuring is the AI's job |
| Initial programme for new users | AI-generated from intake answers ("one free initial plan" = one generation) |

## Architecture overview

```
Manual edit UI ─┐
                ├─> applyOps(programme, ops) ─> new programme ─> vb-programme-v1
AI coach chat ──┘         (engine, pure TS)        + undo ring buffer
      │
      └── Supabase Edge Function `ai-coach` (holds Anthropic key)
              ├─ route: chat     → Claude + propose_edits tool → ops[]
              └─ route: generate → Claude structured output → Programme
```

The editing engine is the single mutation path. The manual UI and the AI are two clients of the same operations.

## Section 1 — Data model & ownership

### Programme becomes data

```ts
export type Programme = {
  id: string;
  name: string;
  source: 'seed' | 'ai' | 'custom';
  createdAt: number;
  revision: number;          // bumped on every applied op batch
  weeks: WeekPlan[];         // existing WeekPlan/WorkoutDay/Exercise types, unchanged
};
```

- Stored at localStorage key `vb-programme-v1` (Supabase sync is a later phase).
- `src/data.ts` keeps exporting `TRAINING_PLAN` but is demoted to **seed template**; no page reads it directly for display after migration — everything reads the active `Programme`.

### Profile

```ts
export type Profile = {
  goals: string;             // short free text
  sportContext?: string;     // e.g. "volleyball, comps most Saturdays"
  equipment: string[];       // free-form list, e.g. ["barbell", "dumbbells to 30kg"]
  daysPerWeek: number;
  experience: 'beginner' | 'intermediate' | 'advanced';
};
```

Stored at `vb-profile-v1`. This grounds every AI call. Absent profile ⇒ AI asks in-chat / onboarding prompts for it.

### Migration (first load after update)

If `vb-programme-v1` is absent, fork `TRAINING_PLAN` into it as `{ source: 'seed', name: 'Volleyball Strength', revision: 0, weeks: TRAINING_PLAN }` **with all existing ids intact**. Every existing set log (`w1-d1-e1-0`), history entry, PR, and rest override keeps working. Migration is idempotent and non-destructive.

### Identity rules

- Existing entities keep their `w{N}-d{D}-e{M}` ids. Ids are **permanent handles, never renumbered** — set-log keys (`${exerciseId}-${setIndex}`) and discard logic (`key.startsWith(dayId + '-')`) depend on them.
- Entities created by an edit get a random short id with a type prefix: `ex-k3f9`, `day-p2qx`, `wk-m8rt` (8-char base36 suffix, collision-checked within the programme).
- Week numbering (`weekNumber`, `day`) is **display ordering**, recomputed from array position after structural ops; ids are not.
- **Exercise history and PRs match by exercise `name`** (existing behaviour, unchanged). Renaming an exercise therefore detaches its future logs from its past history. The engine surfaces this as a warning; the UI shows it before apply.

## Section 2 — The editing engine

Pure, UI-free TypeScript: `src/lib/programme/engine.ts`.

```ts
applyOps(programme: Programme, ops: EditOp[]):
  | { ok: true; programme: Programme; warnings: Warning[] }
  | { ok: false; errors: OpError[] }
```

- **Immutable:** returns a new programme; never mutates input.
- **Atomic:** an op batch applies entirely or not at all. First invalid op fails the batch.
- **Op vocabulary (14):**

| Level | Op | Payload (summary) |
| --- | --- | --- |
| Exercise | `update-exercise` | target id; partial of `{name, sets, reps, load, notes, restSec, tracking}` |
| Exercise | `add-exercise` | day id, position, full Exercise sans id (engine assigns id) |
| Exercise | `remove-exercise` | target id |
| Exercise | `reorder-exercise` | target id, new index within day |
| Day | `update-day` | day id, partial `{title}` |
| Day | `replace-day` | day id, full WorkoutDay payload (exercise ids: keep if unchanged, new otherwise) |
| Day | `add-day` | week id, position, full WorkoutDay sans ids |
| Day | `remove-day` | day id |
| Day | `move-day` | day id, new index within week |
| Week | `update-week` | week id, partial `{focus, blockNote, jumpsNote, block}` |
| Week | `replace-week` | week id, full WeekPlan payload — the "replan my week" op |
| Week | `remove-week` | week id (weekNumber of later weeks recomputed) |
| Programme | `update-programme` | partial `{name}` |
| Programme | `append-weeks` | WeekPlan payloads appended at the end |

- **Validation with Zod** (`src/lib/programme/ops.ts`): one schema set does triple duty — validates manual edits, validates AI tool output, and is converted to JSON Schema for the Claude tool definition. Errors: unknown target ids, malformed payloads, empty day (0 exercises), duplicate ids in replace payloads. Warnings (apply proceeds, user is told): removing a day/exercise that has logged sets this cycle; renaming an exercise (history detaches); removing a week.
- **Undo:** snapshot ring buffer at `vb-programme-undo-v1`, last 20 revisions, each entry `{revision, at, label, programme}`. Label comes from `describeOps`. One-tap undo after any apply (manual or AI).
- **`describeOps(ops, programme) → string[]`** — human-readable summaries ("Day B: Back Squat 4×6 → 3×5 @ RPE 7", "Replaced Week 5 (4 days → 3 days, dumbbell-only)"). Used by the AI diff card, the apply confirmation, and undo history labels.
- **Tests:** Vitest unit tests for every op (happy path, invalid target, atomicity, id stability, warning emission). First unit-test setup in the repo; Playwright remains for flows.

## Section 3 — The AI coach agent

### Backend: Supabase Edge Function `ai-coach`

- Secrets: `ANTHROPIC_API_KEY`, `COACH_ACCESS_TOKEN` (phase A gate).
- Routes (one function, `action` field): `chat` and `generate`.
- Model: `claude-sonnet-5`. (Consult the claude-api skill at implementation time for current SDK usage.)
- Phase A access control: request must carry `Authorization: Bearer <COACH_ACCESS_TOKEN>`; otherwise 401. Token entered once on the client in Profile → settings, stored at `vb-coach-token-v1`. No public exposure, no per-user cost risk.

### Request context (assembled client-side)

Profile, full current programme (comfortably within context budget), current week number and today's date, last ~10 `CompletedWorkout` entries, current PRs map, plus the chat messages. Sent as JSON; the edge function builds the prompt.

### Tool-use contract

Claude gets one tool: `propose_edits(ops: EditOp[], summary: string)` — schema generated from the Zod op schemas. System prompt frames it as a strength coach: ground advice in the profile's goals/equipment/schedule; explain briefly in text; prefer the minimal ops that achieve the change; use `replace-day`/`replace-week` for restructures; never invent target ids not present in the provided programme; respect the sport context (e.g. taper leg volume before a comp).

Expected behaviours for the driving use cases:
- Perth: emits `replace-week` for the current week with a dumbbell-only week honouring the block's intent.
- Comp Saturday: emits targeted `update-exercise` / `remove-exercise` ops reducing lower-body volume/intensity in the days before.

### Client UX: propose → apply

- New Coach chat screen (entry: tab bar or Home sheet — final UI designed at implementation time with the frontend-design skill; sentence-case labels, no letterspaced uppercase, theme tokens from `src/lib/themes.ts`).
- The model's reply renders as text plus a **diff card** listing `describeOps` lines, with **Apply** and **Dismiss** buttons. Warnings (e.g. "logged sets on removed day") show on the card.
- **Nothing mutates until Apply.** Apply runs `applyOps` client-side (the server never writes the programme), bumps `revision`, records undo.
- If the proposed ops fail client validation (model error), the card shows a retry affordance that sends the validation errors back to the model.
- Chat history persisted at `vb-coach-chat-v1`, scoped per programme id, capped (~50 messages).

### Error handling

- Network/5xx: inline retry in chat; no state lost (chat input preserved).
- 401: prompt to re-enter access token.
- Model returns no tool call (pure advice): render text only — valid outcome.
- Model returns invalid ops: never applied silently; validation errors surfaced + retry loop (max 2 automatic retries server-side before falling back to showing the failure).

## Section 4 — Onboarding & programme generation

- First-run wizard when no programme and no history exist (fresh users), also reachable from Profile → "New programme". Existing users (Peter) never see it uninvited — migration precedes it.
- Steps: goals → sport/context (optional) → experience → equipment (multi-select chips + free text) → days per week → programme length (weeks). Writes `vb-profile-v1`.
- Calls `ai-coach` route `generate`; Claude returns a complete `Programme` as structured output validated by the same Zod schemas (server-side validation with one automatic repair retry).
- Client shows a week-by-week preview; **Accept** installs it as the active programme (`source: 'ai'`); Decline discards. Switching programmes archives the old one at `vb-programme-archive-v1` (simple array, no UI beyond restore-last for now — YAGNI).
- "One free initial plan" = one `generate` per user, enforced in phase B; phase A is Peter-gated so unenforced.

## Section 5 — Tokens & payments (phased; schema now, build later)

- **Phase A (this build):** bearer-secret gate, Peter only. No accounts, no balances.
- **Phase B:** Supabase auth (magic link). Postgres tables:
  - `profiles (user_id pk, created_at, free_generation_used bool default false)`
  - `credits (user_id pk, balance int default 0)`
  - `credit_events (id, user_id, delta, reason, created_at)` — append-only ledger; balance is derivable, column is a cache.
  - Edge function enforces: `generate` free once, then 1 credit; each `chat` call that returns a proposal costs 1 credit, decremented server-side at proposal time (not apply time — server can't see applies; accepted cost model: a dismissed proposal still consumed a credit).
- **Phase C:** Stripe checkout for credit packs, webhook → `credit_events`.
- Phases B and C get their own specs; this design only commits the schema direction so A→B needs no rework.

## Section 6 — Manual edit UI (light)

All manual edits call `applyOps` — same engine, same undo trail.

- **WorkoutPage edit mode:** toggle in the day header. Per-exercise bottom sheet: name, sets, reps, load, rest, notes, tracking; remove (with logged-sets warning); drag/buttons to reorder; "Add exercise" at list end.
- **WeekOverview:** per-day overflow menu — move day (reorder within week), remove day (warning if logged sets). No week-level manual restructuring UI — that's the AI's job.
- Rest-override note: editing `restSec` via the engine updates the prescription; the existing `vb-rest-overrides-v1` per-name override continues to win at runtime (unchanged behaviour).

## Build order (each step independently shippable)

1. **Client core:** Programme/Profile types, migration, engine + ops + Zod schemas, undo, `describeOps`, Vitest setup, light manual edit UI. Pure client; no backend.
2. **AI coach:** Supabase project, `ai-coach` edge function (chat), coach chat UI with diff cards, access-token setting. **Unlocks the Perth / comp-Saturday use cases.**
3. **Onboarding:** intake wizard, `generate` route, preview/accept flow.
4. **Tokens:** auth + credits + Stripe — separate spec later.

## Out of scope (explicitly)

- Programme sync across devices (comes with phase B auth).
- Exercise library/database with canonical ids (names stay the identity for history).
- Lower-is-better time PRs, template marketplace, social features.
- Any change to the logging flow, PR rules, or completion/share screens.

## Testing strategy

- **Engine:** exhaustive Vitest unit tests (op semantics, atomicity, id stability, warnings, migration idempotency).
- **AI contract:** Zod validation of recorded sample model outputs; edge function tested with mocked Anthropic client.
- **Flows:** Playwright — migration preserves logged progress; manual edit → persists → undo restores; coach proposal card apply/dismiss (mocked network).
