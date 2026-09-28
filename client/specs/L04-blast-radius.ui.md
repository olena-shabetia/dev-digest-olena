# L04 — Blast Radius (client)

Package-local UI contract. See the cross-package spec
`../../specs/L04-blast-radius.md` for the feature's full scope, the flow
diagram, and the degraded semantics; this file covers the client-side
decisions a future change to this area must preserve.

## Placement

One route: `client/src/app/repos/[repoId]/pulls/[number]/`.

```
page.tsx
 └─ {tab === "overview"}
     ├─ IntentCard
     ├─ BlastRadiusCard   ← new, directly after IntentCard
     └─ OverviewTab (description only, untouched)
```

There is no two-column Overview layout and no "Review Focus" block in this
codebase — the card goes in the existing single column. Moving it to a
right column, or into `OverviewTab` itself, is a separate layout change, not
this feature's.

## The card stays route-local

`_components/BlastRadiusCard/` — `BlastRadiusCard.tsx`, `index.ts`,
`helpers.ts`, `constants.ts`, `styles.ts`, plus nested
`_components/BlastTree/` and `_components/BlastGraph/`. It is **not**
promoted to `client/src/components/`: there is exactly one consumer, and
`client/INSIGHTS.md` fixes promotion at the *second* consumer, never
speculatively (the same precedent as `IntentCard`, see
`client/specs/L03-intent-layer.ui.md`).

Built from `Card`, `SectionLabel`, `Chip`, `Badge`, `MonoLink`, `EmptyState`,
`ErrorState`, `Skeleton` out of `@devdigest/ui`
(`client/src/vendor/ui/primitives/index.ts`) — check that barrel before
hand-rolling anything. There is no severity concept here: pills use the
existing `--info`/`--info-bg` (endpoints), `--warn`/`--warn-bg` (crons) and
`--accent` (changed symbol) CSS tokens through `Badge`. No
`Record<Severity, …>` map is introduced.

## Component tree

```
BlastRadiusCard                     (container: loading/error/degraded/empty/data)
 ├─ Card > SectionLabel "Blast radius" + view toggle (Tree | Graph, Chips)
 ├─ stats strip (symbols · callers · endpoints · crons)
 ├─ degraded status line (role="status"), shown IN ADDITION to any data
 ├─ BlastTree   (view === "tree")
 │   └─ one row per downstream entry: expand/collapse, callers, endpoint/cron badges
 └─ BlastGraph  (view === "graph")
     └─ hand-rolled SVG, three columns: changed symbol / callers / endpoints
```

`useBlastRadius(prId)` lives in `client/src/lib/hooks/reviews.ts`, next to
`useSmartDiff`, built on `apiFetch` — the tree has zero bare `fetch` calls
and this feature keeps it that way:

```
useBlastRadius(prId) = useQuery({
  queryKey: ["pr-blast", prId],
  queryFn: () => api.get<BlastRadiusResponse>(`/pulls/${prId}/blast`),
  enabled: !!prId,
  staleTime: 60_000,
})
```

No invalidation wiring: a review run doesn't change the blast radius, so it
is not added to `page.tsx`'s `onRunDone` invalidation set.

## State matrix

| State | Condition | Renders |
|---|---|---|
| Loading | `isLoading` | `Skeleton`s inside `Card` — never a blank box |
| Error | `error` set (fetch failed) | `ErrorState` with `error.title`/`error.body`, `onRetry={refetch}` |
| Degraded + data | `degraded: true`, `downstream.length > 0` | stats strip + degraded status line + the tree/graph, all together |
| Degraded + empty | `degraded: true`, `downstream.length === 0` | stats strip + degraded status line + `noDownstream` text (no empty tree/graph pane) |
| Empty, not degraded | `degraded: false`, `downstream.length === 0` | stats strip + `noDownstream` text |
| Data | `degraded: false`, `downstream.length > 0` | stats strip + the tree/graph for the current view |

The card never renders an empty pane for any state — this is the same rule
`client/INSIGHTS.md` states for `IntentCard`'s `unavailable` sources: a
degraded or empty result must never look like a blank card.

`degraded: true` is not read as "no results": the ripgrep fallback path can
tag a non-empty, useful result as `reason: 'no_data'` (see the cross-package
spec's "Degraded semantics"). The degraded line and the data render
together, never one instead of the other.

## Tree vs Graph behaviour

- **View toggle** — two `Chip active` buttons (`view.tree` / `view.graph`)
  in a `role="group" aria-label={t("viewToggle")}` wrapper. Ephemeral local
  state, never written to the URL — it is display-only, not a fetch
  parameter.
- **BlastTree** — one row per `downstream` entry: a `<button
  aria-expanded>` with a chevron, a mono `symbol`, and `t("callerCount",
  {count})`. The first row starts expanded; the rest track local expand
  state. Expanded rows list `file:line` per caller, then endpoint badges,
  then cron badges. A footer shows the `uncalled` line
  (`stats.symbols` minus the number of distinct changed symbols that appear
  in `downstream`, floored at 0) when > 0, and an `endpointsUnattributed`
  row of endpoint badges when `endpoints.length > 0` but every downstream
  entry's `endpoints_affected` is empty (D7's "unattributed" case).
- **BlastGraph** — a pure `layoutBlastGraph(downstream, factsByFile)` helper
  (React-free, unit-testable) lays out three fixed columns: symbols on the
  left, de-duplicated callers (`file:name:line`) in the middle, endpoints on
  the right, with `symbol→caller` and `caller→endpoint` edges. Each column
  is capped (`MAX_GRAPH_SYMBOLS`, `MAX_GRAPH_CALLERS`,
  `MAX_GRAPH_ENDPOINTS`), with a `"more"` node carrying a count when capped.
  Crons are **not** in the graph — the legend is "changed symbol / callers /
  endpoints affected" — they stay Tree-only. Rendered as React `<text>`
  nodes (escaped by construction), never `dangerouslySetInnerHTML`.

## The link rule (D10)

Caller `file:line` links point at `pr.head_sha` via the existing
`githubBlobUrl(repoFullName, sha, file, line)`. Caller files are usually not
part of the diff itself, so the blob view at head is the right target, not a
diff view. When `repoFullName` is `null` (repo not loaded yet), `file:line`
renders as plain mono text, not a link — never a broken `href`.

Caveat (inherited from the server spec's "Known facade limits"): index data
can be slightly stale relative to `head_sha`, so a linked line can drift by
a few lines when the default branch moved after the last index run. Accepted
for this slice; a future `index_sha` field on `BlastRadiusResponse` would let
the link pin to the indexed commit instead.

## i18n keys

Namespace `client/messages/en/blast.json` (existing file, add keys only —
never rename or remove one). Reused as-is: `stat.symbols`, `stat.callers`,
`stat.endpoints`, `stat.crons`, `view.tree`, `view.graph`, `callerCount`,
`noDownstream`, `graph.empty`, `graph.ariaLabel`. Added by this feature:
`degraded.flag_off`, `degraded.index_failed`, `degraded.index_partial`,
`degraded.repo_too_large`, `degraded.no_data`, `error.title`, `error.body`,
`endpointsUnattributed`, `uncalled`, `expand`, `collapse`, `viewToggle`,
`graph.more`, `graph.legend.changed`, `graph.legend.callers`,
`graph.legend.endpoints`. The card heading reuses `brief.json`'s existing
`block.blast` ("Blast radius") — no second "Blast radius" string is added
anywhere. `common.json`'s `actions.retry` is reused for the error state's
retry label if needed. `degraded.no_data` copy states the results are a
**best-effort text search that may be incomplete**, never "no data" — see
the cross-package spec.

Every `aria-label`/`title`/SVG `<title>` string is a `next-intl` key, never
a literal — checked by grepping the card's own JSX before reporting done.

## Why no Mermaid or graph library (D9)

`@devdigest/ui` has no graph primitive, `recharts` does not do node-link
diagrams, and `mermaid` renders asynchronously into `innerHTML` from a text
DSL — that would carry repo-derived symbol and path text into markup
without React's escaping. A hand-rolled SVG with React-rendered `<text>`
nodes is escaped by construction and needs no new dependency. Layout is a
pure helper, testable in isolation, with capped node counts and "+N more"
nodes rather than an unbounded canvas.

## Tests

`BlastRadiusCard.test.tsx` (vitest + jsdom + RTL, `fetch` stubbed, the
`IntentCard` test harness pattern — `NextIntlClientProvider` +
`QueryClientProvider`), 3 flow tests:

1. Happy path: stats strip renders, the first symbol is expanded by
   default, a caller link's `href` equals `githubBlobUrl(...)`, endpoint and
   cron pills are visible, collapsing via the row button works, and
   switching to the Graph view exposes `getByRole("img", { name:
   …ariaLabel })`.
2. Degraded with data: the degraded status text and the tree both render
   together.
3. Empty and not degraded: the `noDownstream` text renders and no tree rows
   appear.

`helpers.test.ts` (≥4 tests): graph layout caps and "more" nodes, edges only
ever pointing at present nodes, `uncalledCount`, `showUnattributedEndpoints`.

Queries follow the `getByRole` → `getByLabelText` → `getByText` priority;
`getByTestId` only as a last resort.

See also: `../../specs/L04-blast-radius.md`,
`../../server/specs/L04-blast-radius.api.md`,
`../specs/L03-intent-layer.ui.md` (the placement and route-local precedent).
