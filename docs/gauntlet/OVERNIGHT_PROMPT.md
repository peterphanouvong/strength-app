# Overnight Gauntlet Loop — paste everything below the line into Claude Code

---

ultracode

Run a Gauntlet Loop on this app overnight. You are the LEAD: you never build and you never grade — you set the bar, split the work, spawn builder/critic pairs via the Workflow tool, route failures to fresh builders, and merge what passes.

GOAL: take this volleyball strength PWA from "working" to indistinguishable from a top-tier consumer fitness app — visual quality that wins blind A/B against the reference screens in docs/design-refs/, and functional reliability proven by an automated Playwright suite you build tonight.

## Phase 0 — answer key + harness (do first)

1. Read docs/design-refs/, the full codebase, and docs/gauntlet/ notes. Write docs/gauntlet/ANSWER_KEY.md: for every unit below, concrete pass/fail criteria that a critic can verify from artifacts alone (screenshots, test output, diffs). Critics judge ONLY against this key and the reference images — they must never invent standards. Commit it first.
2. Install @playwright/test + chromium (dev deps). Build a harness that runs against the production build (`npm run build && npm run preview`), seeds localStorage fixtures, taps through flows, and screenshots each step at 390×844.

## Units (split further whenever a unit fails twice)

Visual — bar = blind A/B against docs/design-refs/ + ANSWER_KEY, judged on 390×844 screenshots:
- V1 weeks list · V2 week detail · V3 workout session · V4 completion screen
- V5 bottom sheets (set type / rest config / exercise history) · V6 rest countdown bar + active-workout pill

Functional — bar = ANSWER_KEY + green Playwright specs written for the unit:
- F1 full workout flow: start → log every set → finish → completion stats match the fixture arithmetic
- F2 rest timer lifecycle: auto-start on set tick, +15s, skip, expiry behavior
- F3 session conflict: starting a second workout raises the sheet; both resolutions work
- F4 exercise history + progression placeholders: seed 3 weeks of logs, assert history sheet contents and input placeholders
- F5 set types: assign W/F/D, persists across reload, shows in history
- F6 PWA integrity: manifest valid, SW precaches, every route loads offline, icons resolve
- F7 data safety: storage keys/shapes unchanged; reload mid-workout loses nothing

Quality:
- Q1 adversarial code review sweep (real bugs only — every finding verified by an independent skeptic before fixing)
- Q2 performance: Lighthouse mobile perf ≥ 90, a11y ≥ 95, installable PWA; JS bundle < 500 kB gzipped

## Gauntlet rules (non-negotiable)

- Builders and critics get fresh, separate contexts. Critics never see builder reasoning — only artifacts, the ANSWER_KEY, and the reference image.
- Blind A/B: give the critic the two screenshots with labels stripped ([A]/[B] randomized), demand a binary pick + evidence per criterion.
- A critic that graded a draft never grades the retry. A builder whose work failed never fixes it — route the critique to a fresh builder.
- Deterministic gate before any critic spends tokens: tsc clean, vite build clean, existing Playwright suite green.
- Run longer than feels necessary. Stop a unit only when it passes, or after 2 consecutive rounds with zero improvement (record the exact gap in the report).
- SMOOTH: when all units are done, one fresh agent reconciles cross-unit inconsistencies (spacing, copy, motion timing) without redesigning, then the full gate + one final all-screens critic pass.

## Guardrails

- Work on branch gauntlet/overnight-1. Commit per passed unit (message = unit id + what changed). Never touch main. Never force-push. No deploys, no tunnels — nothing leaves this machine.
- NEVER alter the training programme content in src/data.ts — sets, reps, loads, percentages, progression, and coaching notes are coach-approved and frozen. Refactoring the structure around them is fine.
- localStorage keys and value shapes stay backward-compatible (real training data may exist).
- Design system is fixed: court/flame/mint/zest/mist palette, Space Grotesk, tight tracking, no letterspaced-caps labels. Improve within it, don't replace it.
- Only new dependency allowed without justification: @playwright/test. Anything else → record why in the report.
- Known env quirk: if the build dies with missing @rollup/* or lightningcss native modules (npm optional-deps bug), fix with `rm -rf node_modules package-lock.json && npm install`.

## Morning report

Write docs/gauntlet/GAUNTLET_REPORT.md: per unit — rounds run, PASS/FAIL verdicts with critic evidence, before/after screenshots (saved under docs/gauntlet/shots/), remaining gaps below the bar, and the commits involved. Plus totals: tests added, Lighthouse scores, bundle size, and anything you'd flag for human review. Send a push notification when finished or if permanently blocked.

BUDGET: run until 7:00 am or until every unit passes, whichever comes first. If constrained, priority order is F-units > V-units > Q-units.
