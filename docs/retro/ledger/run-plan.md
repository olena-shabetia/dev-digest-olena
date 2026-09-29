# Retro ledger — run-plan

Dated entries from `workflow-retro`. Append-only — see root AGENTS.md-style
rule: correct a wrong entry with a new dated entry that supersedes it, never
edit or delete an old one. Manual runs only; nothing here was auto-generated.

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
