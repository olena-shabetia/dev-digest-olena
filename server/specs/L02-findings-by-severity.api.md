# L02 — Findings by severity (server)

Package-local API contract. See the cross-package spec
`../../specs/L02-findings-by-severity.md` for the full feature scope; this
file covers the server-side contract and the reasoning behind it, mirroring
the L01 (`run cost badge`) precedent in the same module.

## Contract addition

`server/src/vendor/shared/contracts/platform.ts` adds two schemas and one
field on `PrMeta`:

```ts
PrFindingPreview  // one finding, trimmed for the list popover — no action
                  // fields (no accepted_at/dismissed_at/id), no full rationale
PrFindingsRollup  // { critical, warning, suggestion, total, preview[] }
PrMeta.findings: PrFindingsRollup.nullish()
```

`.nullish()` is mandatory: `PrDetail = PrMeta.extend({...})`, and both the
detail route and `MockGitHubClient` construct `PrDetail`/`PrMeta` payloads
that never set `findings` — the field is list-endpoint-only, same as `score`
and `cost_usd`.

`server/src/vendor/shared` is canonical; `client/src/vendor/shared` is a
byte-for-byte derived copy (verified via `diff` before and after this
change) — edit the server copy first, then sync.

## Null vs. all-zero (mirrors `cost_usd`)

- `findings: null` — the PR has **no review yet**. Render `—`.
- `findings: {critical:0, warning:0, suggestion:0, total:0, preview:[]}` —
  the PR **has** a review and it found nothing. A real, distinct state.

Collapsing these into one representation (e.g. defaulting to all-zeros when
there's no review) would silently claim "reviewed and clean" for a PR nobody
has looked at — the same bug class `cost_usd`'s null-vs-`$0` rule guards
against.

## Latest review only

The rollup reflects the PR's **latest** review — the same one `score` already
reflects — not a merge of every historical review. This is what "N FINDINGS
IN THIS RUN" means on the list popover. Implemented for free: the existing
score query in `reviewAggregatesByPr` already walks reviews newest-first and
keeps the first-seen row per PR; capturing that row's `id` alongside its score
gives the exact "latest review id per PR" set the findings query needs — no
`ORDER BY`/`DISTINCT ON` duplication and no join, just one more
`inArray(findings.reviewId, latestReviewIds)` query grouped in JS.

## Where the query lives

Per the L01 rule already written up in `server/INSIGHTS.md` ("before adding a
new query to a route handler, check whether the route already has an inline
query it never should have had"), the new query was added to
`reviewAggregatesByPr()` in `pulls/repository.ts`, not as a second inline
query in `routes.ts`. The route mapper gains exactly one new line
(`findings: agg?.findings ?? null`).

`findings` has no `workspace_id` column of its own — it's reachable only
through `reviews.id`. The `reviews` query in `reviewAggregatesByPr` was
missing an explicit `workspace_id` filter before this change (it relied on the
caller's `prIds` already being workspace-scoped); this feature adds
`eq(reviews.workspaceId, workspaceId)` there directly, since it's now the sole
gate protecting cross-workspace `findings` access.

## Preview policy

Capped at 5 (`FINDINGS_PREVIEW_LIMIT`, `pulls/status.ts`), ordered
CRITICAL → WARNING → SUGGESTION, then `file`, then `start_line` — deterministic
across identical requests, so the popover never reshuffles on a re-render.
`total` counts every finding of the review (including any severity outside
the three known buckets); `preview` is the bounded, ordered slice.
`rationale` is flattened to plain text and truncated to 160 chars
(`plainTextPreview`) — the popover is a text-only preview, not the full
finding.

## Pure transform vs. SQL

Counting and preview-ordering happen in JS (`toFindingsRollup`,
`pulls/status.ts`) rather than in a `CASE`-ordered SQL query, per
`server/CLAUDE.md`'s repository/helpers split (`repository.ts` = SQL,
`helpers`-shaped pure functions = transforms). The dataset per PR is at most a
few dozen findings, so this costs nothing and keeps the ordering
independently unit-testable (`server/test/pulls-status.test.ts`) without a
database.
