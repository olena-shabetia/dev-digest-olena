# Retro ledger — run-plan

Dated entries from `workflow-retro`. Append-only — see root AGENTS.md-style
rule: correct a wrong entry with a new dated entry that supersedes it, never
edit or delete an old one. Manual runs only; nothing here was auto-generated.

### 2026-09-30 — L05b Onboarding Tour: full SDD pipeline (spec → plan → 7-unit, 3-wave run), one fix round, two post-hoc rework passes

**Agents:** 12 launched + 2 SendMessage resumes (spec-creator, implementation-planner), order: spec-creator → implementation-planner → WU-1/WU-2 → WU-3/4/5 → WU-6/7 → architecture-reviewer → plan-verifier → fix implementer → scoped plan-verifier → out-of-plan implementer (First tasks)
**Cost:** 1 of 2 fix rounds used; per-agent tokens as reported by completion notices ranged ~76k-256k, no session-wide total surfaced; agent model for implementers not visible in-context

**Friction:**
- Lesson slug chosen as L06 from "last spec is L05" without checking README.md:88 (which lists Onboarding under L05); user then chose L05b, costing a spec-creator resume and three stray duplicate files (spec-creator's Bash is read-only, could not delete).
- implementation-planner stopped on 9 blocking questions that all carried recommendations; all 9 were accepted as-is, one avoidable round trip.
- WU-1 finished `partial` because server/test/contracts.test.ts still called the removed `Onboarding.parse` — tsc does not cover server/test/**, no unit owned the file.
- Five implementers (WU-1..WU-5) each hit that eslint has no `--format=unix` formatter (command was in the plan); WU-5 also hit `pnpm typecheck -- --pretty false` failing with TS5023.
- WU-7 could not open design screenshots stored under /tmp, built the UI from SPEC-07 text only; the user later reported mismatches in Critical paths / How to run locally / Guided reading path, and First tasks (no design existed in the spec) needed a contract change (`complexity`) after the fact.
- Migration 0016 was generated but never applied to the dev DB; the first page load showed `column "workspace_id" does not exist`. All gates were hermetic.

**Worked well:**
- File-lease waves: 7 units, zero blocked, zero foreign failures; vendor-sync barrier clean.
- plan-verifier with file:line evidence caught two real spec deviations (AC-35 llm_calls null vs 0, AC-47 unwrapped candidate paths) that per-unit gates missed; scoped re-verification took a fraction of the full pass.
- implementation-planner surfaced a real design flaw beyond the spec (JobRunner re-invoking a timed-out handler would double LLM calls) -> D-9 deadline.

**Duplicated:** the `--format=unix` / `pnpm typecheck --` quirks rediscovered by 5 agents; every implementer preloaded many skills, several self-reported as irrelevant.

**Gaps:**
- User's brief asked to commit each stage separately and to send the plan to cross-model review before implementation: neither happened, and the AC -> task -> test -> commit matrix could not be produced (no tests, no commits).
- engineering-insights and pr-self-review not run; second consecutive run-plan entry with the engineering-insights gap (see 2026-09-29 below) — one more repeat makes it a skill defect.
- Orchestrator-made edits (3 components, styles, specs, contracts.test.ts, db:migrate) and the out-of-plan First tasks change got no verifier pass; AC-50 demo not run.

**Recommendations:** planner: list real verification commands and grep server/test/** for replaced contract symbols; add a coordinator step to apply migrations and smoke the new route; store design images in-repo, not /tmp. spec-creator: check README lesson table before choosing a slug. Orchestrator: copy the user's original brief into a session checklist and reconcile before "done". run-plan: add an explicit engineering-insights line to the final report template.

### 2026-09-29 — 13-unit, 5-wave parallel L05 run, zero fix rounds, one 146-min outlier unit

**Friction:**
- One implementer unit (WU-13, a client page + one-line vendor nav edit) took ~146 minutes wall clock vs. 2–8 minutes for every other unit in the same plan — an order-of-magnitude outlier that only became visible in hindsight via the agent's own usage report, not during the run. Cause unknown (not investigated live).
- A `.it.test.ts` (Testcontainers-backed) failed under Docker load during a wave barrier; took a manual `git stash push -u -- <plan-owned paths>` re-run to confirm it was a pre-existing environment flake, not a regression — cost an extra investigation cycle.
- A stale `server/pnpm-workspace.yaml` pnpm-12 stub (already documented in server/INSIGHTS.md) silently broke `pnpm db:migrate` at the final barrier; had to be deleted manually before the command would run.

**Gaps:**
- Root AGENTS.md's mandatory "run engineering-insights before finishing" was skipped, despite 3+ implementer manifests surfacing explicit INSIGHT CANDIDATES this run.

**Recommendations:**
- run-plan: have each implementer's manifest report its own wall-clock duration, so a same-wave outlier is visible immediately instead of only in a later retro.
- run-plan: document the Testcontainers-contention-during-parallel-waves risk as a known, expected false-positive pattern (link to the git-stash isolation technique), so a future run doesn't re-investigate from scratch.
- run-plan: add "run engineering-insights" as an explicit, un-skippable line in its own final report template — it's easy to treat "plan-verifier clean" as the finish line and miss this separate repo-wide requirement.
