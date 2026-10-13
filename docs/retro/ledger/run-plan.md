# Retro ledger — run-plan

Dated entries from `workflow-retro`. Append-only — see root AGENTS.md-style
rule: correct a wrong entry with a new dated entry that supersedes it, never
edit or delete an old one. Manual runs only; nothing here was auto-generated.

### 2026-10-13 — L07 Multi-Agent Review: full SDD pipeline (spec → plan → 6-unit, 3-wave run), one fix round, one stray agent relaunch caught and stood down, one mid-run session rate limit

**Agents:** 12 launched (spec-creator, implementation-planner, implementer×8 incl. 1 stray duplicate + 1 fix round, architecture-reviewer, plan-verifier), order: spec-creator → implementation-planner → WU-1/WU-2 → WU-3/WU-4 (interrupted by a session rate limit, 1 stray duplicate relaunch stood down, both resumed via SendMessage to their original agent ids) → WU-5/WU-6 → architecture-reviewer → plan-verifier → fix implementer
**Cost:** 1 of 2 fix rounds used. Deep-measured from subagent transcripts (`cache_read_input_tokens` etc. summed per agent): total 338,881 fresh tokens (input+output), 134,128,872 cache-read, 5,208,008 cache-creation, 570 tool calls, 4,677s summed agent-time. WU-4 (client entry points: AgentPickerPopover + ConfigureRun + RunList + nav wiring) was the single most expensive unit at 55,855 tokens / 106 tool calls / 30.5M cache-read — more than double every other implementer, including WU-6 which built a comparably-sized UI tree for 42,423 tokens / 91 tool calls.
**Metrics:** tokens 338,881 · cache-read 134,128,872 · tool calls 570 · agent-time 4,677s · parallelism max 2 concurrent, 3 waves (confirmed by transcript timestamps overlapping within each wave)

**Friction:**
- Mid wave 2, a session-wide rate limit cut off WU-3 and WU-4 simultaneously (21,606s and 21,619s gaps respectively, visible in their transcripts). The first recovery attempt called `Agent` fresh instead of `SendMessage` to the original agent ids, spawning a context-less duplicate (agent-a68ccaaab1de80a65, "Resume WU-3") that burned 1,726 tokens / 3 tool calls / 30s before being told to stand down — it touched no files. The two real agents were then correctly resumed via `SendMessage` and finished cleanly.
- One file outside every wave-2/3 unit's lease (`client/src/lib/hooks/reviews.ts:249`) had a stale comment referencing a component WU-4 deleted (`RunReviewDropdown`) — no unit's "Done when" gate (scoped lint/typecheck) covered it since it was a comment, not code. The orchestrator fixed it directly as a one-line out-of-plan change.
- A sibling git worktree (different feature, same `0018` migration base) independently generated its own `0019` migration between planning time (when the plan's own §9 flagged this as a *risk*) and apply time (when it had become a *concrete* file). Required an unplanned diff-and-renumber step (confirmed schema-disjoint first) rather than being caught by any unit gate.
- WU-4 cost roughly 2-3x every sibling implementer by every metric (tokens, tool calls, cache-read) for a unit of comparable UI scope to WU-6 — not investigated live, flagged here for pattern-watching.

**Worked well:**
- The plan's "contract freeze" (exact Zod shapes + HTTP surface table written into the plan text itself) produced zero contract deviations across all 6 units and zero architecture-reviewer findings on the full diff.
- plan-verifier's one PARTIAL finding (null-cost should render "unknown" text, not `formatCost`'s `"—"`) cited the exact file:line and the existing pattern to copy (`ResultsHeader.tsx:26-29`'s `header.costUnknown` key) — the fix round implementer needed zero rediscovery, confirmed by its clean manifest.
- Resuming the two genuinely rate-limit-interrupted agents via `SendMessage` to their original agent ids (once the orchestrator corrected its first mistaken approach) picked up exactly where each left off, redid nothing already done.

**Duplicated:** none among the 6 real work units (disjoint file leases, frozen contracts). One wasted agent invocation from the stray-duplicate relaunch mistake above (zero file changes, but a real token/tool-call cost).

**Gaps:**
- engineering-insights WAS run this time (3 entries appended) — breaks the two-in-a-row skip pattern flagged in the 2026-09-29 and 2026-09-30 entries below; no longer an open defect.
- Real run metrics were not visible in-context during the run itself (no `<usage>` block surfaced in any agent's text manifest) — only recoverable after the fact via a `--deep` pass over the subagent transcripts. The default in-context retro pass is structurally blind to cost for this kind of session.

**Recommendations:** run-plan: add an explicit line to step 2 — resume a rate-limit-interrupted agent via `SendMessage` to its original agent id, never a fresh `Agent` call; this session self-corrected only after actually spawning a duplicate. implementation-planner: grep for unowned cross-references (e.g. a comment naming a component a unit is about to delete) before finalizing file leases, so a plan doesn't leave a known stale-reference gap for the main thread to patch after the fact. run-plan step 2b: re-check for new sibling-worktree migrations immediately before applying, not just at planning time — the collision here only became concrete between planning and apply. workflow-retro: note in reference/data-sources.md that the in-context pass will be all-`n/a` on cost for sessions where agents return prose manifests with no visible `<usage>` block — `--deep` is not optional polish for these, it's the only way to get a non-empty cost table.

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
