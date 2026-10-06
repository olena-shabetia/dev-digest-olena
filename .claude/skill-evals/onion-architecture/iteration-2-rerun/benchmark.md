# Skill comparison: onion-architecture v1.0.0 (old) vs v1.1.0 (new)

**Written for:** the skill author (Olena), to decide whether v1.1.0 replaces v1.0.0.
**Runs:** 4 evals × 2 versions × 2 runs = 16 runs, all completed without errors.
**Tools per run:** Read, Glob, Grep, Bash (identical for both versions).
**Grading:** manual, against the assertions in `evals/evals.json`. The grader is the same model family as the subject, so treat the pass rates as indicative.

## What changed in v1.1.0

- New section **"Module tier audit"**: a per-module table of routes / service / repository tiers, four ordered rules, and a shell recipe that produces the raw table.
- New checklist item: "New or touched module? → run the module tier audit".
- Description now triggers on "auditing which tiers every module has".
- New eval 4 (`tree-tier-audit`), run against the real `server/src/modules/` tree. It checks the new check, including two false-positive traps.

Snapshots: `../snapshots/v1.0.0/` and `../snapshots/v1.1.0/`.

## Pass rates

| Eval | Assertions | v1.0.0 run 1 | v1.0.0 run 2 | v1.1.0 run 1 | v1.1.0 run 2 |
|---|---|---|---|---|---|
| 1 bookmarks-routes-sql | 4 | 4/4 | 4/4 | 4/4 | 4/4 |
| 2 digests-concrete-adapter | 3 | 3/3* | 3/3 | 3/3 | 3/3 |
| 3 alerts-cross-module | 3 | 3/3 | 3/3 | 3/3 | 3/3 |
| 4 tree-tier-audit (new) | 6 | 5/6 | 5/6 | 6/6 | 5/6 |
| **Total** | **16** | **15/16** | **15/16** | **16/16** | **15/16** |

\* Old run 1 of eval 2 started in an empty working directory and reviewed a different copy. It then said `service.ts:2` imports a path "that isn't in the tree". That path does exist in the fixture (`adapters/openai/client.ts`). The assertion passes, but the review has a false claim. Counted as a run artifact, not a skill result.

Totals: **v1.0.0 30/32 (94%)**, **v1.1.0 31/32 (97%)**.

## Where they differ

**Eval 4 is the only eval that separates the versions, and the new check is the reason.**

- Both versions found the four modules whose `routes.ts` import Drizzle or `db/schema` (`settings`, `polling`, `pulls`, `workspace`). Both avoided the false positives (`blast`, `pr-history`, `project-context`, `smart-diff` have no queries; `reviews` has a `repository/` folder).
- **Old:** said "route-only module" for `polling` and `workspace` but did not state "no repository.ts" for them. Both old runs fail the `finds-missing-repository` assertion on that point. It also used `depcruise` and the anti-pattern doc, so it leaned on a tool, not a per-module table.
- **New run 1:** 6/6. Gives a per-module verdict with the missing tiers named.
- **New run 2:** 5/6. It reported `workspace` as "rule 3 does not apply" because its only DB work is a query in `routes.ts` (lines 21–24) and it treated the mapping as the main work. **Rule 3 in the skill already says "does business work *or* DB work", so this is a misreading the skill's wording did not prevent.** See the recommendation below.

**Cost and time**

| | v1.0.0 | v1.1.0 |
|---|---|---|
| Avg wall time per run | 38.1 s | 47.9 s (driven by one 172 s outlier in eval 2 run 2) |
| Avg cost per run | $0.226 | $0.189 |
| Avg output tokens per run | 6,290 | 5,404 |
| Avg turns per run | 10.8 | 8.2 |

On eval 4 the new version is cheaper and faster: $0.23–0.30 against $0.37–0.38 per run, with 9 turns against 13–17. The old version spent its turns on `depcruise` and broader exploration.

## Recommendations

1. **Ship v1.1.0.** It matches the old version on evals 1–3 and beats it on the new check, at lower cost on that eval.
2. **Tighten rule 3** so the misreading in new run 2 cannot recur. Suggested wording: "Rule 3 applies to *any* Drizzle query in `routes.ts`, even a single one, and whether or not the route also does business work."
3. **Watch the eval-4 fixture.** It runs against the live repo (`server/src/modules/**`). Results will change as the modules change, so re-check the ground truth before comparing a later iteration.
4. **Stale line numbers.** Both versions' runs reported that `reference/anti-patterns.md` cites line numbers that no longer match the tree (for example, `settings/routes.ts:30,53,61` is now `25,55,63`). That reference should be refreshed separately.

## Housekeeping

- `iteration-2/` (not `iteration-2-rerun/`) is an earlier, incomplete attempt. Its runs had no Bash access, so the v1.1.0 audit runs were blocked on the table script. Delete it. I could not, because the removal was blocked by a safety check and needs your approval.
- Nothing in the repo's tracked files changed except `.claude/skills/onion-architecture/SKILL.md`. The eval folders are still untracked.
