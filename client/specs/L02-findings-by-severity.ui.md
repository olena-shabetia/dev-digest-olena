# L02 — Findings by severity (client)

Package-local UI contract. See the cross-package spec
`../../specs/L02-findings-by-severity.md` for the feature's full scope and
null semantics; this file covers implementation decisions specific to the
client that a future change to this area needs to preserve.

## Shared component

`client/src/components/severity-filter-bar/` — one component,
`SeverityFilterBar`, used by all three surfaces (PR-detail run-card pills,
Timeline chips, PR-list column), the same way `client/src/components/run-cost-badge/`
is shared across the COST surfaces from L01. It lives at this top level
(not under a route's `_components/`) precisely because it crosses route
boundaries: `[repoId]/pulls/[number]/…` (detail) and `[repoId]/pulls/…` (list).

Two shapes from one prop:

- `onSelect` supplied → interactive, real `<button>`s with `aria-pressed`.
- `onSelect` omitted → read-only, plain `<span>`s. This is what makes the
  Timeline chips and the PR-list column non-clickable *by construction* —
  there is no separate "disabled" flag to forget to set.

Severity **colors and icons** come from the vendored `SEV` tokens
(`client/src/vendor/ui/primitives/tokens.ts`) — reused, not touched. Severity
**labels** are localized in `client/messages/en/prReview.json` under
`severity.*` and rendered with `textTransform: uppercase` in CSS, never baked
into the message string (`SEV[...].label` is hardcoded English and
`*/src/vendor/**` is do-not-touch).

## Pill state lives in `FindingsPanel`, not `ReviewRunAccordion`

This is the one non-obvious decision in the feature. The pill row renders
inside `FindingsPanel`'s toolbar, directly under `VerdictBanner` (which
satisfies "pills under the verdict/PR SCORE" — `ReviewRunAccordion` renders
`VerdictBanner` then `FindingsPanel` with nothing between them).

`FindingsPanel` already owns a `hideLow` ("Hide low confidence") filter that
removes cards. If severity counts were computed one level up in
`ReviewRunAccordion`, they would drift out of sync with `hideLow` the moment
it's toggled — a pill could show `3` while only `2` cards render. So counting
must happen inside `FindingsPanel`, after `confidenceFiltered()` and before
the severity filter:

```
findings → confidenceFiltered(hideLow) → [COUNT HERE] → visibleFindings(severity) → rendered cards
```

`FindingsPanel/helpers.ts` splits what used to be one `visibleFindings`
function into `confidenceFiltered` (hide-low + sort) and `visibleFindings`
(severity filter only), so the pipeline's count stage sits exactly between
them. Each `ReviewRunAccordion` mounts its own `FindingsPanel`, so per-run
independence is free — there's no shared state to isolate.

**Self-heal:** if the active severity filter's bucket disappears (e.g.
`hideLow` drops every SUGGESTION below the confidence threshold), the panel
falls back to the unfiltered list rather than showing "No findings match" for
a severity that quietly stopped existing. `active = buckets.some(b =>
b.severity === severity) ? severity : null` recomputes this on every render —
no separate effect needed to "notice" the change.

## Timeline chips

Derived once in `FindingsTab.tsx` from data already fetched
(`ReviewRecord.findings`, from `usePrReviews`), keyed by `run_id`, and passed
to `RunHistory` as two optional props: `severityByRun` (the tally, for the
chips themselves) and `findingsByRun` (the records, for the hover popover
below). A run absent from the severity map (running/failed/cancelled — no
review yet) falls back to the existing plain findings/blockers text rather
than showing empty pills.

The chips are **still not clickable** — `SeverityFilterBar` is rendered with
no `onSelect`, same as before — but as of this revision they do open the same
read-only hover popover as the PR-list column (see below), because a run tile
is exactly as cramped as a list row and the user asked for the same
affordance in both places. "Read-only" and "hoverable" are independent axes:
the pills still can't be clicked or filtered, they just now disclose their
detail on hover instead of only in the accordion below.

## Findings hover popover (PR list + Timeline)

Promoted to `client/src/components/findings-popover/` — the second consumer
(`RunHistory`'s Timeline tiles) arrived after the PR-list `FindingsCell`, so
this followed the same "promote on second use" precedent as
`severity-filter-bar` and `run-cost-badge`. It exports:

- `FindingsPopover` — presentational, takes `{ id, total, preview, style }`.
- `useFindingsHoverPopover(previewCount, hasMore)` — the trigger mechanics
  (hover-intent timer, focus/blur, Escape, scroll/resize-close, viewport
  placement), free of any page's business logic. Callers own the `<div
  role="group">` trigger element and decide what counts as "the findings" —
  `FindingsCell` reads `pr.findings` (a server-computed rollup of the PR's
  *latest review*); `RunHistory`'s `TimelineFindings` reads `findingsByRun`
  (a specific *run's* own findings, already in the browser, mapped locally
  from `FindingRecord` to `PrFindingPreview` via `RunHistory.tsx:toPreview`
  — capped at `TIMELINE_PREVIEW_LIMIT` and ordered CRITICAL → WARNING →
  SUGGESTION → file:line, mirroring the server's rollup ordering so the two
  popovers read consistently even though one is server-truncated and the
  other is a client-side slice of already-complete data).
- `estimateHeight` / `placePopover` — pure placement helpers.

### Why a portal

The table row (`pulls/styles.ts`, `s.tableCard`) sets `overflow: "hidden"` to
round its corners, and the Timeline tile (`RunHistory.tsx`, `rowStyle`) has no
such clipping but sits in a scrolling tab body either way. An
absolutely-positioned popover risks clipping or scroll-desync in both spots.
The popover is rendered via `createPortal(..., document.body)` with `position:
fixed`, positioned from `getBoundingClientRect()` at open time
(`findings-popover/helpers.ts:placePopover`, a pure function so placement is
unit-testable without a real layout pass). Because it's portaled and fixed, it
doesn't track scroll — it closes on scroll/resize instead of chasing the
trigger.

### Why it's `pointer-events: none`

The popover has zero interactive content (no buttons, no links — the
acceptance criterion, in both places it's used). With nothing inside worth
moving the pointer toward, `pointer-events: none` sidesteps the whole
enter/leave race between the trigger and the popover: the trigger's own
`onMouseLeave` is the only thing that ever closes it.

### Why it's not a generic vendor primitive

`*/src/vendor/**` is do-not-touch (root `CLAUDE.md`), and this component is
domain-specific (renders `PrFindingPreview`s, not arbitrary content) — a
generic `Popover` abstracted from findings would be premature. It lives under
`client/src/components/` rather than a vendor primitive precisely because it's
this domain-specific, cross-route shared component, not a generic building
block.

### Accessibility

Both triggers are `tabIndex={0}` `role="group"` elements. The PR-list cell
additionally carries a **permanent** `aria-label` summarizing the counts
(`list.findings.cellAria`) — screen-reader and keyboard users get the core
information without depending on the hover-only popover, which is enrichment;
the Timeline tile doesn't repeat this (the tile's own text already states the
counts via the visible pills). Both open on `focus`/`mouseenter` (120ms
hover-intent delay) and close on `blur`/`mouseleave`/`Escape`/scroll/resize.
