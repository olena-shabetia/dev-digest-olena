---
name: run-plan
version: 1.0.0
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
         (multi-agent / single-agent) and the wave list.
- [ ] 2. For each wave, in order:
         - multi-agent: launch one `implementer` per unit in the wave, in
           parallel, each given the plan path + unit id only (never the
           plan's prose inline).
         - single-agent: launch one `implementer` per unit, sequentially.
         Collect each unit's manifest (STATUS/GATES/CONTRACT DEVIATIONS/
         BLOCKERS). A `blocked`/`failed` unit stops the skill here — report
         it, don't proceed to the next wave.
- [ ] 3. Run `architecture-reviewer` over the full diff accumulated so far.
- [ ] 4. CRITICAL or HIGH findings open? -> fix round (below). Otherwise
         continue to step 5.
- [ ] 5. Run `plan-verifier` against the plan path (+ spec path if given).
- [ ] 6. UNMET or PARTIAL requirements? -> fix round (below). Otherwise done.
- [ ] 7. Report the final verdict (see "Report format").
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

## Next steps
- test-writer was not run — invoke it manually if this feature needs coverage.
- Run /pr-self-review before pushing — this skill's architecture pass is not the push gate.
```

## Cost notes

`architecture-reviewer` and `plan-verifier` both run on Sonnet, not Opus.
`implementation-planner` and `spec-creator` stay on Opus since a bad plan or
spec is expensive to unwind later — but a review/verification subagent runs
several times per plan (once per fix round on top of the initial pass), and
Sonnet is sufficient for both: they extract and match evidence against a
fixed document rather than design under ambiguity. Don't move either back to
Opus without a demonstrated accuracy problem, not just a hunch.
