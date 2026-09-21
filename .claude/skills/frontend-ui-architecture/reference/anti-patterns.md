# Anti-patterns — real drift in this tree

These are documented as **examples of drift to recognize, not a work order**.
Fixing them is a separate task; this file exists so a new change doesn't
copy the pattern.

## Business logic inline in a page instead of `helpers.ts` / a hook

`app/repos/[repoId]/pulls/page.tsx` has a sibling `helpers.ts` for exactly
this purpose, but the filter/search/sort pipeline is written inline in the
page body instead:

```ts
// app/repos/[repoId]/pulls/page.tsx (~lines 49-61)
const filtered = (pulls ?? [])
  .filter((p) => status === "all" || p.status === status)
  .filter((p) => !q || p.title.toLowerCase().includes(q) || String(p.number).includes(q))
  .slice()
  .sort((a, b) => { ... });
```

**Fix pattern:** a pure `filterAndSortPulls(pulls, { status, query, sort })`
in `helpers.ts`, unit-testable without rendering the page.

`app/repos/[repoId]/pulls/[number]/page.tsx` has no `helpers.ts` at all, and
holds three hand-written cache-invalidation callbacks
(`invalidateActiveRuns`, `invalidateRunHistory`, `invalidatePulls`, ~lines
51-66) plus the findings-derivation flatMap (~lines 80-85) directly in the
component body. Per the business-logic ladder, cache invalidation belongs at
the `lib/hooks/*` layer (see how `hooks/reviews.ts` already owns similar
invalidation graphs), and the findings derivation belongs in a `helpers.ts`
this page doesn't yet have.

## Constant declared inline instead of in the sibling `constants.ts`

```ts
// app/repos/[repoId]/pulls/page.tsx, line 25
const OPEN_STATUSES = new Set(["needs_review", "reviewed", "stale"]);
```

This page already has a `constants.ts` sibling holding `STATUS_META`,
`SIZE_COLOR`, `STATUS_FILTERS`, etc. — `OPEN_STATUSES` belongs there next to
`STATUS_META`, not declared ad hoc in the page body.

## Hardcoded copy instead of an i18n key

```ts
// app/repos/[repoId]/pulls/[number]/page.tsx, line 161
if (window.confirm("Delete this run from history? (its logs are removed too)"))
```

Violates the "all user-facing strings go through `next-intl`" rule — a
`confirm()` dialog is still user-facing text. **Fix pattern:** pull the
string from `messages/en/prReview.json` via `t(...)` before passing it to
`window.confirm`, the same way every other label in this file already does.

## A component folder missing its `index.ts`

`app/repos/[repoId]/pulls/[number]/_components/RunHistory/` has
`RunHistory.tsx` and `RunHistory.test.tsx` but no `index.ts`. Every other
`_components/<Name>/` folder in the tree has one. This isn't just
inconsistency — it means `RunHistory` can't be promoted to
`client/src/components/` later as a clean move; whoever promotes it will
have to add the barrel at the same time instead of just relocating the
folder.

## Hand-rolled color map instead of the canonical tokens

Documented in full in `client/INSIGHTS.md` (2026-09-18, "Recurring Errors &
Fixes"): a trace-drawer findings section built its own local `SEV_COLOR` map
that mapped `SUGGESTION` to the wrong token, instead of using the vendored
`SEV` tokens (`client/src/vendor/ui/primitives/tokens.ts`) and the
`SeverityBadge` component every other severity chip in the app already uses.

**Rule:** before adding any severity-colored UI, grep for `SEV\[` /
`SeverityBadge` first. A new `Record<Severity, string>` anywhere outside
`tokens.ts` is the bug, not a legitimate one-off style.
