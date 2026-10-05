---
name: run-plan
version: 1.1.0
type: Workflow
description: >-
  Executes an approved Development Plan end-to-end — runs each wave's
  implementer units (parallel in multi-agent mode, sequential in
  single-agent mode), then loops architecture-reviewer and plan-verifier
  fix rounds until clean or the iteration cap is hit. Requires an existing
  plans/<slug>.md, already written beforehand by a separate manual
  spec-creator + implementation-planner pass, and optionally the spec it
  was built from — this skill never invokes either of those itself and
  never writes a spec or a plan. Does not write tests either — run
  test-writer separately after this skill reports clean. Use when the user
  asks to implement, build, or execute an already-approved plan, or invokes
  /run-plan.
---

# Implement

Runs the build phase of Spec Driven Development: plan → code → architecture
review → plan verification, with automatic fix iterations in between.
Everything upstream (writing the spec, writing the plan) and downstream
(writing tests, opening the PR) happens as separate, deliberate steps outside
this skill — see "Not part of this skill" below.

## Input

Invoked as `/run-plan plans/<slug>.md [specs/<...>.md]`.

- **Plan path (required).** An already-written `plans/<slug>.md` from
  `implementation-planner`. If it's missing or the path doesn't exist, that's
  the entire response — ask for it, don't guess which plan.
- **Spec path (optional).** Passed through to `plan-verifier` alongside the
  plan so it also checks EARS acceptance criteria, not just the plan's own
  work units. If omitted, `plan-verifier` checks the plan only.

## Not part of this skill

Run these manually — two before this skill, two after — bundling any of
them in would spend tokens on work the caller may not want on every run:

- **`spec-creator`** — writes the spec. Run before this skill if no spec
  exists yet.
- **`implementation-planner`** — writes the plan this skill executes. Always
  run before this skill — it refuses to guess a plan into existence.
- **`test-writer`** — deliberately skipped, even after a clean verdict, to
  keep the default run cheap. Say so explicitly in the final report so it
  isn't mistaken for "no tests needed."
- **`/pr-self-review`** — the actual push gate. This skill's architecture
  pass is a cheaper, earlier check on the same rules, not a replacement —
  never claim it unblocks a push.

## Workflow

Copy this checklist and tick off as you go:

```
- [ ] 1. Read the plan (and spec, if given). Confirm execution mode
         (multi-agent / single-agent) and the wave list. Then:
         - Read the plan's "Precondition" section. If it needs work
           committed or set aside first, ask the user and WAIT for the
           answer — an unanswered precondition is not a closed one.
         - If the plan cites design images or other reference files, confirm
           the paths exist and are readable before launching any UI unit.
           If not, stop and ask — a unit that can't see the design builds
           from text alone and the rework lands later.
         - Re-read the user's original brief for this feature and list what
           it asks for that this skill does NOT cover (per-stage commits,
           plan review before build, tests, a demo). Carry that list to the
           report.
- [ ] 2. For each wave, in order:
         - multi-agent: launch one `implementer` per unit in the wave, in
           parallel, each given the plan path + unit id only (never the
           plan's prose inline).
         - single-agent: launch one `implementer` per unit, sequentially.
         - From wave 2 on, add one "Known tool quirks" line to each unit's
           prompt, built from earlier manifests (e.g. a gate command a unit
           reported as unavailable), so it isn't rediscovered per agent.
         Collect each unit's manifest (STATUS/GATES/CONTRACT DEVIATIONS/
         BLOCKERS). A `blocked`/`failed` unit stops the skill here — report
         it, don't proceed to the next wave.
         A unit that is `partial` only because of a file NO unit owns (for
         example an existing test that a frozen contract replacement broke,
         which `tsc` does not cover) is not a blocker: the main thread makes
         the minimal fix itself and lists it under "Out-of-plan changes".
- [ ] 2b. After the last wave, if the plan generated a DB migration: apply it
         to the dev DB (`pnpm db:migrate` in `server/`, the server does not
         run migrations on boot) and load the new route or page once. The
         unit gates are hermetic and never touch the dev DB. Say in the
         report that you did this.
- [ ] 3. Run `architecture-reviewer` over the full diff accumulated so far.
- [ ] 4. CRITICAL or HIGH findings open? -> fix round (below). Otherwise
         continue to step 5.
- [ ] 5. Run `plan-verifier` against the plan path (+ spec path if given).
- [ ] 6. UNMET or PARTIAL requirements? -> fix round (below). Otherwise done.
- [ ] 7. Report the final verdict (see "Report format"). Any change made
         outside the units after this point (main-thread edits, follow-up
         requests) gets a scoped `plan-verifier` or `architecture-reviewer`
         pass, or is listed as unverified.
```

## Fix rounds

A fix round is **one more targeted `implementer` pass** over only the units
that own the affected files — never a fresh full plan execution, never a
free-roaming fix agent. Give it the specific finding text and file:line so it
isn't rediscovering the problem from scratch.

- **Cap: 2 fix rounds total**, shared between architecture and plan-verifier
  findings (not 2 each). A reviewer that still finds the same class of
  problem after two targeted fixes usually means the plan itself needs
  revisiting, not that a third automatic pass will succeed — stop and hand
  both reports back to the user rather than burning a third round guessing.
- After a fix round, re-run only the check that triggered it (architecture
  *or* plan-verifier), unless the fix touched files the other one cares
  about too — then run both.
- A CRITICAL architecture finding always blocks moving on to
  `plan-verifier`, even once the round cap is reached — report it as the
  headline issue rather than burying it under an incomplete
  plan-verifier pass.

## Report format

```
Plan: <path>
Spec: <path, or "none">
Execution mode: <multi-agent | single-agent>
Waves run: N (units: ...)

Architecture review: <clean | N findings after M fix round(s)>
Plan verification: MET n · PARTIAL n · UNMET n · CANNOT VERIFY n

## Fix rounds spent
<0-2, what each round targeted and its outcome>

## Still open
<CRITICAL/HIGH architecture findings or UNMET/PARTIAL requirements left, or "none">

## Out-of-plan changes
<edits the main thread made outside any unit (unowned files, migration applied,
vendor sync), and whether each was verified, or "none">

## Not covered from the user's brief
<items from step 1's list that this run did not do, or "none">

## Next steps
- test-writer was not run — invoke it manually if this feature needs coverage.
- engineering-insights: <run | NOT RUN — root AGENTS.md requires it before finishing; do it now>
- Run /pr-self-review before pushing — this skill's architecture pass is not the push gate.
```

Do not treat "plan-verifier clean" as the finish line: the `engineering-insights`
line above is a separate, repo-wide requirement (root `AGENTS.md`) and has been
skipped in past runs (see `docs/retro/ledger/run-plan.md`).

## Cost notes

`architecture-reviewer` and `plan-verifier` both run on Sonnet, not Opus.
`implementation-planner` and `spec-creator` stay on Opus since a bad plan or
spec is expensive to unwind later — but a review/verification subagent runs
several times per plan (once per fix round on top of the initial pass), and
Sonnet is sufficient for both: they extract and match evidence against a
fixed document rather than design under ambiguity. Don't move either back to
Opus without a demonstrated accuracy problem, not just a hunch.
