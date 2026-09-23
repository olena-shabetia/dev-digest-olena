# L03 — Smart Diff (client)

Package-local UI contract. See the cross-package spec
`../../specs/L03-smart-diff.md` for the feature's full scope, the flow diagram
and the acceptance criteria; this file covers the client-side decisions a
future change to this area must preserve. Reference implementation mirrored
throughout: `client/src/components/diff-viewer/**` (the existing flat diff
renderer this plan extends) and `_components/FindingsPanel/FindingsPanel.tsx`
(how `useFindingAction` is already wired for a finding card).

## Surface

One route, one tab: `client/src/app/repos/[repoId]/pulls/[number]/`, the
`"diff"` tab (`DiffTab`). No new route, no new page.

```
DiffTab
 ├─ useSmartDiff(prId)         ← NEW: GET /pulls/:id/smart-diff
 ├─ usePrReviews(prId)         ← existing, for full FindingRecord detail
 ├─ toDiffGroupViews(...)      ← NEW pure helper, joins the two
 ├─ "Original order" / "Smart Diff" toggle
 └─ DiffViewer
     ├─ groups? → GroupSection[] (NEW)
     │             └─ FileCard[] (existing, gains `findings?` prop)
     │                 └─ CodeLine (existing, gains inline finding rendering)
     └─ else → flat `files` list (today's behaviour, byte-identical)
```

`DiffTab` stays thin: fetch, toggle, translate labels via
`useTranslations("prReview")`, pass display-ready descriptors down. All
group/role rendering logic lives in the shared `diff-viewer` layer, not in
`DiffTab` — `diff-viewer` is already the shared home for diff rendering, and
`DiffTab` must not duplicate it. Consequence: `diff-viewer` takes **no**
`next-intl` namespace of its own for Smart Diff strings — every label it
renders (`label`, `filesCount`, severity labels) arrives as a prop from the
route. This keeps the shared component namespace-agnostic, matching how it
already only knows about the `shell` namespace for unrelated strings.

## The client does not recompute anything server-derived

Roles, per-file `finding_lines`, and `total_lines` are computed once on the
server (`server/specs/L03-smart-diff.api.md`) and never recomputed here — the
business-logic ladder in `frontend-ui-architecture` puts "derived domain
fields" on the server, and the client never re-derives what an LLM or the DB
already produced. `useSmartDiff` fetches the grouped shape as-is;
`usePrReviews` is used only to get the *full* `FindingRecord` objects (title,
rationale, confidence, accept/dismiss state) needed to render a card — those
are matched to a group's files by `file` + `start_line`, never re-grouped by
role on the client.

## Group ordering and default-collapsed groups

Groups render in the server's fixed order — `core, tests, wiring, docs,
boilerplate` — never re-sorted, and a group with zero matching files is
dropped entirely (not rendered as an empty section). `docs` and `boilerplate`
start **collapsed**; the other three start **open**. This is a display-only
default: `GroupSection` holds its own `React.useState(!group.defaultCollapsed)`
open/closed state per group, independent of the existing per-file
`AUTO_EXPAND_MAX_LINES` rule below.

## The unchanged per-file `AUTO_EXPAND_MAX_LINES` rule

`FileCard`'s existing default-open-if-small heuristic
(`AUTO_EXPAND_MAX_LINES`) is untouched by this plan. Grouping decides whether
a *group* starts open; the existing per-file rule still decides whether an
individual file's diff body starts expanded once its group is open. The two
are independent axes and must not be merged into one flag.

## The group dot counts files-with-findings, not total findings

A `GroupSection` header shows `●<N>` where `N = filesWithFindings` —
**the count of files in that group that have at least one finding**, computed
as `file.finding_lines.length > 0` per file
(`DiffTab/helpers.ts#toDiffGroupViews`). It is deliberately **not** a sum of
every finding across the group: a file with 6 findings and a file with 1
finding both count once. This keeps the dot answering "how many files here
need my attention," which is the question a collapsed group header exists to
answer — a total-findings count would overstate how much reading is actually
required to clear the group.

## The per-file dot is separate from the comment-count icon

`FileCard`'s header already shows an `Icon.MessageSquare` count for PR review
comments. This plan adds a **second, distinct** indicator dot next to it —
never merged into the same icon or count — when `findings.byPath.get(file.path)`
is non-empty. The two counts answer different questions (human PR comments vs.
reviewer findings) and conflating them would make either number ambiguous.
`client/INSIGHTS.md` (2026-09-18) already warns against inventing a second
meaning for one indicator; this is the same principle applied to a new pair
of icons rather than a color map.

## Inline `FindingCard` anchoring

Each `CodeLine` that has one or more findings anchored to it renders:

1. A left color bar using `SEV[severity].c` from `@devdigest/ui` — **never**
   a new `Record<Severity, string>` (`client/INSIGHTS.md` 2026-09-18: the
   `SEV_COLOR` drift story). When a line has findings of more than one
   severity, the highest severity wins the bar color.
2. A right-aligned severity label sourced from `findings.lineLabels[severity]`
   (the three `smartDiff.*` label keys `blockerLabel` / `warningLabel` /
   `suggestionLabel`, translated once by the route, never a literal string in
   `diff-viewer`).
3. The `FindingCard` itself (moved, unchanged, to
   `client/src/components/finding-card/` — see "FindingCard promotion"
   below) rendered directly beneath the line, `defaultExpanded`, wired to the
   same `onAction` callback `FindingsPanel` already uses for accept/dismiss.

Anchoring is keyed by the existing `keysForLine("RIGHT:" + start_line)`
convention `FileCard`/`CodeLine` already use for comment threading — a pure
`anchorFindings(findings)` helper in `diff-viewer/findings.ts` builds a
`Map<string, FindingRecord[]>` keyed the same way, so `CodeLine` matches
findings with the exact same key it already uses for comments, without
re-deriving a line number anywhere.

## FindingCard promotion, and why

`FindingCard` moves from the route-local
`_components/FindingCard/` to the shared `client/src/components/finding-card/`
— byte-for-byte, imports rewritten only (no restyle, no prop change; its
public signature is frozen in the cross-package plan's contract freeze). This
is a **harder trigger than the usual "promote on the second consumer" rule**
(`client/INSIGHTS.md` 2026-09-18): the second consumer here is the **shared**
`diff-viewer` layer itself, and `frontend-ui-architecture`'s import direction
forbids `client/src/components/**` from importing anything under a route's
`_components/**` at all — so leaving `FindingCard` route-local would make the
import illegal outright, not just premature.

Two alternatives were rejected in the plan this spec mirrors:

- Passing pre-rendered `ReactNode`s down into `FileCard`/`CodeLine` — this
  hides the dependency on `FindingCard` and makes the shared component
  untestable in isolation.
- A `renderFinding()` prop — this is the `renderThing()` render-factory
  anti-pattern (`react-best-practices`, CRITICAL: camelCase functions
  returning JSX break reconciliation and lose component identity every
  render).

`FindingCard`'s pre-existing `SEV_COLOR`/`SEV_COLOR_FALLBACK` constant (the
same drift `client/INSIGHTS.md` 2026-09-18 already flags) moves with it
unchanged — a promotion is not a refactor. The cleanup is a separate,
follow-up change.

## The "Original order" toggle

`DiffTab` holds one `React.useState` boolean, labeled via the
`smartDiffToggle`/`originalOrderToggle` i18n keys (`smartOrderToggle`: "Smart
Diff", `originalOrderToggle`: "Original order"). Toggling it does **not**
refetch anything — both the grouped view and the flat view are built from
data already in memory (`usePrFiles`'s existing GitHub-ordered list plus the
`SmartDiff` groups). Flipping to "Original order" hands `DiffViewer` the
same flat `files` prop it has always accepted (`groups` omitted), which is
guaranteed byte-identical to pre-L03 rendering since that code path is
untouched by this plan.

## Failure isolation

While `useSmartDiff` is loading or has errored, `DiffTab` renders the
existing flat view unchanged — the Files-changed tab must never appear
broken because the Smart Diff endpoint is slow, empty, or failing. This
mirrors the server-side rule that Smart Diff is best-effort enrichment, never
a hard dependency of the tab.

## Data layer

`useSmartDiff(prId)` in `client/src/lib/hooks/reviews.ts`, next to
`usePrReviews` — `queryKey: ["pr-smart-diff", prId]`, `enabled: !!prId`,
`api.get<SmartDiffResponse>(`/pulls/${prId}/smart-diff`)`. Invalidated by
`["pr-smart-diff", prId]` inside the existing `useRunReview` and
`useDeleteReview` `onSuccess` callbacks — a run changes `finding_lines`, so a
completed run must refresh the grouped view; an accept/dismiss
(`useFindingAction`) does not change any file's line list, so it is
deliberately left alone.

`client/src/lib/types.ts` re-exports `SmartDiff`, `SmartDiffFile`,
`SmartDiffGroup`, `SmartDiffRole`, `SmartDiffResponse` from
`@devdigest/shared` — the existing `SmartDiff` re-export is widened, never
duplicated.

## Copy

All eight new strings go into the existing `smartDiff` object in
`client/messages/en/prReview.json` — no new namespace file, no hardcoded
copy anywhere in `diff-viewer` or `DiffTab`:

```json
"testsLabel": "Tests",
"docsLabel": "Docs",
"blockerLabel": "blocker",
"warningLabel": "warning",
"suggestionLabel": "suggestion",
"originalOrderToggle": "Original order",
"smartOrderToggle": "Smart Diff",
"filesWithFindings": "{count} files with findings"
```

The 8 pre-existing `smartDiff.*` keys (`coreLabel`, `wiringLabel`,
`boilerplateLabel`, `largeTitle`, `largeBody`, `filesCount`, `findingLines`,
`groupedByRole`) stay byte-identical. `filesCount` and the new
`filesWithFindings` interpolate small integers (file counts per PR) — per
`client/INSIGHTS.md` (2026-09-18), `next-intl`'s `{count}` does not group
thousands, but these values never approach that range, so no pre-formatting
is added.

## Tests

- `finding-card/FindingCard.test.tsx` — moves with the component; asserts the
  promotion changed no behaviour (same tests, new import paths only).
- `DiffTab/DiffTab.test.tsx` — groups render in the fixed order; `docs` and
  `boilerplate` start collapsed; the "Original order" toggle restores
  GitHub's flat order without a second fetch. `fetch` mocked per
  `client/AGENTS.md`.
- `diff-viewer/DiffViewer/DiffViewer.test.tsx` — a file with a finding shows
  its dot (distinct from the comment-count icon) and renders the finding
  card under the correct line via `RIGHT:<start_line>`.

Queries follow the `getByRole` → `getByLabelText` → `getByText` priority;
`getByTestId` only as a last resort.

See also: `../../specs/L03-smart-diff.md`, `../../server/specs/L03-smart-diff.api.md`,
`../docs/ui-architecture.md`, `../specs/pages.md` (the PR-detail route this
tab lives on).
