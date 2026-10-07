# Agent comparison: architecture-reviewer (strict) vs architecture-reviewer-lite

**Written for:** whoever decides whether `architecture-reviewer-lite` is worth keeping as the
cheap-tier reviewer, or should be dropped.
**Runs:** `pnpm eval:repeat agents/architecture-reviewer -n 3 --label strict` and the same for
`-lite`, both auto-capped 3→2 by the tool's token-economy guard. Claude Code subscription backend
(no OpenRouter cost), same 4 fixtures/practices both sides (`architecture-reviewer-lite.eval.ts`
imports `architecture-reviewer`'s own `.cases.ts` — a controlled A/B, not two unrelated evals).
**n=2 — indicative only**, per the tool's own stddev caveat. Raw summaries:
`results/repeat-strict.json`, `results/repeat-lite.json` (gitignored, regenerate to reproduce).

## Why `eval:delta` doesn't apply here

`eval:delta` matches records by full **nodeid** (file path + describe + test name), designed for
"same eval file, before vs after an edit." `architecture-reviewer` and `architecture-reviewer-lite`
are two different eval *files* that happen to share practice text, so every nodeid is unique to one
side — `eval:delta strict lite` runs without error but prints each side's practices once, under a
`—% -> X%` or `X% -> —%` row, never a real same-row diff. The comparison below is assembled by hand
from the two `eval:repeat` summaries instead, matching on test/practice **text**, which is what
actually lines up across the two files.

## What differs between the two agents

| | `architecture-reviewer` (strict) | `architecture-reviewer-lite` |
|---|---|---|
| model | `sonnet` | `haiku` |
| skills | `onion-architecture`, `frontend-ui-architecture`, `next-best-practices`, `react-best-practices`, `typescript-expert` (5) | `onion-architecture` (1) |
| prompt | full (client + backend axes) | same prompt, backend-only axis, client axis explicitly marked out-of-scope |

## Per-case results (n=2 each)

| Case | strict test pass | lite test pass | Notable practice shift |
|---|---|---|---|
| flags both violations in the checkout diff | 0/2 | 0/2 | identical on every practice (layering 100%, DI 100%, severity 100%, verbatim 100%, rule-id 50%, gate-verdict 0% — both sides) |
| does not fabricate for out-of-scope security change | 0/2 | 0/2 | lite **better**: "stays scoped to structural findings" 50%→100% |
| cites the DevDigest-specific rule identifier (reviewer-core) | 0/2 | 0/2 | lite **worse**: fs-import flag 100%→50%, verbatim evidence 100%→50% |
| does not fabricate for a benign rename | 0/2 | 0/2 | identical (100%/100%/0%) |

Both agents fail the strict `ends with an explicit PASS/FAIL gate verdict` and exact-rule-id
practices on every case, on both models — that's a case-calibration issue shared by both variants
(the practice may be miscalibrated against what either agent's prompt actually asks for), not a
lite-specific regression.

## Cost signal

| | strict | lite |
|---|---|---|
| turns (reviewer-core case) | 24 ± 3 | **12 ± 0** |
| turns (checkout-diff case) | 12 ± 1 | 16 ± 1 |
| tok_out (checkout-diff case) | 2294 ± 449 | 2601 ± 70 |

No consistent turns/tokens win either way at n=2 — the one large gap (reviewer-core case, 24 vs 12
turns) suggests the 5-skill prompt pushes `architecture-reviewer` into more exploration, but a
single outlier at this sample size isn't a claim, just a signal worth re-measuring at n≥5.

## Recommendation

**Lite is a real trade, not a free lunch.** It holds up or improves on 2 of 4 cases (identical, and
better scoping on the security-shaped case) but visibly regresses on the reviewer-core case (the one
requiring verbatim, precisely-quoted evidence) — plausibly because Haiku + a narrower skill set is
less careful about exact-quote citation than Sonnet. Use lite where the cost matters more than
citation precision (e.g. a fast advisory pass); keep strict as the reviewer whose verdict gates a
merge. Re-run at n≥5 before trusting the per-practice percentages as anything but direction.
