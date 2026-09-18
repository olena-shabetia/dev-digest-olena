# L02 — Findings by severity

Cross-package spec. Implementation plan: see PR description / commit history
around this spec's introduction; this file is the binding contract for the
*shape* of the feature, per root `CLAUDE.md`'s "write the spec first" rule.

## Problem

DevDigest already tallies findings by severity (`CRITICAL` / `WARNING` /
`SUGGESTION`) internally, but nowhere does a reviewer see that breakdown
without reading every finding card. A reviewer who only cares about blockers
has no way to isolate them, and the PR list gives no hint of a PR's findings
shape before opening it.

## Scope — three surfaces

1. **PR detail → Agent runs → Review runs** — each expanded run card shows a
   row of pills `N CRITICAL · N WARNING · N SUGGESTION` under the verdict / PR
   SCORE, showing only severities actually present. Clicking a pill narrows
   the finding cards below to that severity; clicking it again clears the
   filter and restores the full list.
2. **PR detail → Agent runs → Timeline** — the same pills, read-only (no
   click), on each run's tile, so a run's shape is visible before expanding it.
3. **PR list** — a `FINDINGS` column with severity icons for the PR's latest
   review. Hovering (or focusing, for keyboard users) reveals a read-only
   popover titled "N FINDINGS IN THIS RUN" previewing up to 5 findings
   (severity, title, category, file:line, confidence, a short description) —
   text only, no Accept/Dismiss buttons. Those buttons exist only on the PR
   detail page's Review-runs accordion (`FindingCard`).

Explicitly **out of scope**: renaming "Dismiss" to "Reject" (the API action,
`dismissed_at` column, and keyboard shortcut `d` all already say dismiss —
only the acceptance-criteria wording used "Reject"); a Popover/Tooltip design
primitive (this feature ships a domain-specific one instead — see
`client/specs/L02-findings-by-severity.ui.md` §Popover); denormalizing
per-run severity counts onto `agent_runs` (the counts are derived on read from
data already fetched, so no new column or migration is needed).

## Counting semantics — no LLM, ever

All three surfaces group findings that are **already in memory** (fetched by
`usePrReviews` on the PR detail page, or by `GET /repos/:id/pulls` on the
list). Grouping is a plain `reduce`/`filter` over the `severity` field — no new
network request, no LLM call, on page load or on any pill click. See
`client/src/lib/severity.ts` (`severityBuckets`, `bySeverity`) and
`server/src/modules/pulls/status.ts` (`rollupSeverities`, `toFindingsRollup`).

**Invariant:** in the run-card filter, a pill's number always equals the
number of finding cards its own click would leave visible. This requires
counting *after* the existing confidence filter ("Hide low confidence") and
*before* the severity filter — see `client/specs/L02-findings-by-severity.ui.md`
for why the ordering matters.

## Null semantics (PR-list `findings` field)

Mirrors the `cost_usd` rule from L01: `PrMeta.findings` is `null` when the PR
has **never been reviewed** — render `—`, never all-zero counts. A reviewed PR
with zero findings gets `{critical:0, warning:0, suggestion:0, total:0,
preview:[]}` — "reviewed and clean" is a real, distinct state from "unknown".
The rollup reflects the PR's **latest** review only (same review the SCORE
column already reflects), which is what "N FINDINGS IN THIS RUN" means.

## Non-goals

- No new LLM-facing schema or prompt change — this is a display feature over
  existing `Finding.severity` values.
- No per-workspace or per-agent severity dashboards.
- No change to Accept/Dismiss semantics or the `d`/`a` keyboard shortcuts.
- No generic Popover/Tooltip design-system primitive (`*/src/vendor/**` stays
  untouched); the list-page popover is a local, single-purpose component.
