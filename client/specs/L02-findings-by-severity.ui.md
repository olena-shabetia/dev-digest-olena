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

- `FindingsPopover` — presentational, takes `{ id, total, preview, style,
  repoFullName?, headSha?, onMouseEnter?, onMouseLeave?, onClose? }`. Renders
  every item of `preview` — there is no "+N more" truncation on either
  surface (see below).
- `useFindingsHoverPopover(previewCount)` — the trigger mechanics
  (hover-intent timer, close-delay, focus/blur, Escape, scroll/resize-close,
  viewport placement), free of any page's business logic. Callers attach its
  handlers, and a `popoverRef`, to **both** the trigger element and the
  popover itself (see "why it's no longer `pointer-events: none`" below) and
  decide what counts as "the findings" — `FindingsCell` reads `pr.findings`
  (a server-computed rollup of the PR's *latest review*, now uncapped — see
  `server/specs/L02-findings-by-severity.api.md` §Preview policy);
  `RunHistory`'s `TimelineFindings` reads `findingsByRun` (a specific *run's*
  own findings, already in the browser, mapped locally from `FindingRecord`
  to `PrFindingPreview` via `RunHistory.tsx:toPreview`, ordered CRITICAL →
  WARNING → SUGGESTION → file:line to match the server's ordering so the two
  popovers read consistently).
- `estimateHeight` / `placePopover` — pure placement helpers. `estimateHeight`
  clamps its own growth at `POPOVER_LIST_MAX_HEIGHT` (see below) rather than
  taking a `hasMore` flag — since neither surface truncates anymore, there is
  nothing left to conditionally add height for.

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

### Scrolling and the file:line link — revision after first ship

The first cut of this popover was strictly read-only (no buttons, no links,
`pointer-events: none`) and grew to fit its content with no cap. Feedback
after shipping asked for two things the read-only version couldn't do: scroll
through a long finding list without the popover overrunning the viewport, and
click a finding's `file:line` straight through to that line on GitHub (the
same link `FindingCard` already builds via `githubBlobUrl`, reusing
`repoFullName`/`headSha`. `FindingsCell` gets `repoFullName` from a new prop
threaded `pulls/page.tsx` → `PRRow` → `FindingsCell` off `useActiveRepo()`;
`head_sha` needed no new plumbing since it's already on every `PrMeta` row.
`RunHistory` already had both from `FindingsTab`).

Both requirements make the popover interactive, so it's no longer
`pointer-events: none`:

- **Scroll:** `s.list` caps at `POPOVER_MAX_VISIBLE_ROWS` (4) rows via
  `maxHeight` + `overflowY: auto`; `estimateHeight` clamps to the same cap so
  the above/below flip decision doesn't grow unbounded with a long list.
- **Link:** `file:line` renders as a plain `<a target="_blank">` (opens in a
  new tab) when both `repoFullName` and `headSha` are known, otherwise the
  same plain mono text as before — the link is enrichment, not a hard
  requirement. It's **not** the vendored `MonoLink` — `MonoLink` is
  gray-until-hover by design (its convention on `FindingCard`), but this
  popover's design calls for an always-blue, always-underlined link
  (`s.link`: `color: var(--accent-text)`) so it reads as clickable without a
  hover first. `MonoLink` itself is do-not-touch (`*/src/vendor/**`) and has
  no style-override props, so a plain anchor was the only way to get that
  look without changing `MonoLink`'s behavior for its other callers.
- **Hover bridging:** with real content inside, the popover can't be
  `pointer-events: none` anymore, so leaving the trigger no longer closes it
  immediately. `useFindingsHoverPopover` now exposes `scheduleClose` (a
  `HOVER_CLOSE_MS` delayed close) instead of an immediate `close` for
  `mouseleave`, and both the trigger *and* the popover call `scheduleOpen`
  on `mouseenter` / `scheduleClose` on `mouseleave` — so moving the pointer
  across the ~8px gap between them, or scrolling the list, keeps it open, and
  it only actually closes once the pointer has left both for the full delay
  (or via `Escape`/blur/scroll/resize, which still close immediately).

### Follow-up fixes after that revision shipped

Two more rounds of feedback, both on the same scroll+link revision above:

1. **Scrolling the list closed the popover.** The `scroll`/`resize` listener
   from the portal-doesn't-track-scroll fix (see "Why a portal") is a
   *capturing* `window` listener, so it also fires for the popover's own
   internal list scroll — scroll events aren't special, they capture/bubble
   like any other DOM event. `useFindingsHoverPopover` couldn't tell "the
   page scrolled out from under a fixed popover" (should close) apart from
   "the list inside the popover scrolled" (should not). Fixed by adding a
   `popoverRef` (attached to `FindingsPopover`'s root div via the React 19
   ref-as-prop, no `forwardRef` needed) and checking `popoverRef.current
   ?.contains(e.target)` in the scroll handler — a scroll whose target is
   inside the popover is ignored, anything else still closes it.
2. **No cap, ever — remove the "+N more" truncation entirely.** Once the list
   scrolls, capping the preview at all only makes findings unreachable; it
   doesn't save anything the scroll wasn't already handling. `preview` now
   always equals `total`, on both surfaces — the server's
   `FINDINGS_PREVIEW_LIMIT` and the client's `TIMELINE_PREVIEW_LIMIT` were
   both deleted (see `server/specs/L02-findings-by-severity.api.md` §Preview
   policy), and `FindingsPopover`'s `more`/footer block went with them.
3. **Oversized empty gutter next to the scrollbar.** `s.list` had a
   `paddingRight: 4` stacked on top of the popover's own `14px` right
   padding, and a long mono file path had no `overflowWrap`, so it could
   force horizontal overflow — on some platforms that renders a second
   (horizontal) scrollbar and an unstyled native scrollbar-corner square
   where the two meet. Fixed by adding `overflowWrap: "anywhere"` to the
   file:line row so it wraps instead of overflowing, `overflowX: "hidden"` on
   `s.list` so a horizontal scrollbar can never appear, and reducing the
   popover's own right padding (`padding: "10px 6px 10px 14px"`, asymmetric
   on purpose) since the list's scrollbar already reserves space on that
   side.

Accept/dismiss actions are still **not** here — the criterion that survives
unchanged is "no accept/dismiss inside this popover"; those buttons remain
exclusive to the PR detail page's Review-runs accordion (`FindingCard`). Test
naming reflects the narrower claim now: "no buttons, and no link when the
repo isn't known" rather than "no links, ever."

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
