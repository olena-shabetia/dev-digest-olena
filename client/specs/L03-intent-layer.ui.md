# L03 — Intent Layer (client)

Package-local UI contract. See the cross-package spec
`../../specs/L03-intent-layer.md` for the feature's full scope, the
demote-not-delete decision and the provenance model; this file covers the
client-side decisions a future change to this area must preserve.

## Surface

One route: `client/src/app/repos/[repoId]/pulls/[number]/`.

```
page.tsx
 └─ content container (page.tsx:150)
     ├─ {tab === "overview"} IntentCard, then OverviewTab
     ├─ {tab === "findings"}  FindingsTab
     │                          └─ ReviewRunAccordion → VerdictBanner + FindingsPanel  ← scope disclosure here
     └─ {tab === "diff"}      DiffTab
```

**2026-09-23 revision:** the card originally rendered above every tab block
(so it was visible before reading findings on any tab). Reworked at the
user's request to render inside the Overview tab only, alongside
`OverviewTab`. The scope-disclosure and always-visible-strip mechanisms in
`FindingsPanel`/`FindingsTab` (below) are what carry the "verify the task
before reading findings" property into the Findings tab now — the card
itself no longer needs to be visible there.

## The Intent card stays route-local

`_components/IntentCard/` — `IntentCard.tsx`, `index.ts`, `styles.ts`,
`constants.ts`. It is **not** promoted to `client/src/components/`: there is
exactly one consumer, and `client/INSIGHTS.md:18-41` fixes promotion at the
*second* consumer, never speculatively.

Structure copies `VerdictBanner`
(`_components/VerdictBanner/VerdictBanner.tsx:12-58`), the closest existing
analogue — icon box + heading + summary paragraph + chip rows. Built from
`Card`, `SectionLabel`, `Chip`, `Badge`, `EmptyState`, `Skeleton` out of
`@devdigest/ui` (`client/src/vendor/ui/primitives/index.ts`); check that
barrel before hand-rolling anything (`client/AGENTS.md:19-20`).

Contents:

| Region | Renders |
|---|---|
| Heading | localized label + a confidence `Chip` (`high` / `medium` / `low`) |
| Summary | the `intent` sentence, in quotes |
| IN SCOPE | `in_scope[]` as a ✓ column |
| OUT OF SCOPE | `out_of_scope[]` as a ✕ column |
| Sources | one chip per `IntentSource`: `kind`, `ref`, `chars`. `status: 'unavailable'` renders in the warning colour with the matching `context_gaps` text beside it; `absent` renders muted |
| Actions | **Re-derive** button → `useDeriveIntent()` |

States: `isLoading` → `Skeleton`; `data === null` (never derived) →
`EmptyState` with the Re-derive action; `error` set on the record → the error
text plus Re-derive. An `unavailable` source must never render blank — that is
the whole honesty property the server works to preserve.

## Scope filtering lives in `FindingsPanel`

Out-of-scope findings collapse behind a
`Showing N of M — K outside the stated scope` disclosure inside
`_components/FindingsPanel/FindingsPanel.tsx`, not one level up in
`ReviewRunAccordion`. `FindingsPanel` already owns the `hideLow` ("Hide low
confidence") filter and the severity pills, and
`client/INSIGHTS.md:43-62` is explicit: **a count badge must be derived at the
same pipeline stage the filter it labels reads from.** The pipeline becomes:

```
findings → confidenceFiltered(hideLow) → [severity counts]
        → bySeverity(active) → [scope counts K / N / M here]
        → scopeFiltered(showOutOfScope) → rendered cards
```

Counting anywhere earlier lets the disclosure claim `K` while `hideLow` or the
severity pill has already removed some of those cards underneath it.

`in_scope === null` (no intent was derived for that run) is **in-scope by
default** — it must never be swept behind the disclosure. `null` and `false`
are different values and the UI must treat them differently.

## The always-visible strip

The single most severe out-of-scope finding always renders as one visible
strip above the disclosure, copying the Lethal Trifecta strip at
`_components/FindingsTab/FindingsTab.tsx:135-143`. "Most severe" uses
`SEVERITY_ORDER` from `client/src/lib/severity.ts`, with `confidence` as the
tiebreak. This is what makes demote-not-delete honest: collapsing never hides
the worst thing found.

Severity colours and icons come from the vendored `SEV` tokens /
`SeverityBadge`. A new `Record<Severity, string>` anywhere outside
`tokens.ts` is the bug, not a one-off style (`client/INSIGHTS.md:138-159`).

## Data layer

`usePrIntent(prId)` and `useDeriveIntent(prId)` in
`client/src/lib/hooks/reviews.ts`, next to `usePrReviews` at `:45`, built on
`api`/`apiFetch`. The tree has **zero** bare `fetch` calls and must stay that
way (`client/AGENTS.md:14-17`).

- `usePrIntent` — `queryKey: ["pr-intent", prId]`, `enabled: !!prId`, no
  polling (the record only changes on an explicit action or a review run).
- `useDeriveIntent` — `POST /pulls/:id/intent`, invalidates
  `["pr-intent", prId]` on success. It does **not** invalidate `["reviews",
  prId]`: re-deriving intent does not re-label already-persisted findings, and
  pretending otherwise would show stale scope labels as if they were fresh.
- The PR-review run flow already invalidates `["reviews", prId]`; add
  `["pr-intent", prId]` to that same `onRunDone` set in `page.tsx` so the card
  picks up an intent derived during the run.

## Copy

All strings via `next-intl` in `client/messages/en/prReview.json` under a new
`intent.*` namespace — no hardcoded copy (`client/AGENTS.md:18-19`).
`brief.json`'s existing `block.intent: "Intent"` belongs to the (unbuilt) PR
Brief block and is **not** reused here; duplicating a key across namespaces is
cheaper than coupling two unrelated surfaces.

Adding one file under `messages/en/` is parallel-safe by construction —
`client/src/i18n/request.ts` readdir-merges namespaces — but this feature
extends an existing file, so it is owned by exactly one work unit.

Wording follows the spec's framing: *"K findings outside the stated scope"*,
never *"K findings hidden."*

## Settings mirror

`client/src/lib/feature-models.ts:21-27` (`review_intent`) changes its default
to `openrouter` / `deepseek/deepseek-v4-flash` to match
`server/src/vendor/shared/contracts/platform.ts:53-58`. This file is a
**hand-maintained** mirror — `./scripts/check-vendor-sync.sh` does not cover
it, so a server-side change alone leaves the picker showing a stale default.

## Tests

`_components/IntentCard/IntentCard.test.tsx` (vitest + jsdom + RTL, `fetch`
mocked per `client/AGENTS.md:26-28`), 2–3 flow tests:

1. A full record renders the intent sentence, both scope columns, the
   confidence chip and every source; clicking **Re-derive** fires the
   mutation.
2. `confidence: 'low'` with an `unavailable` source renders the warning state
   and the `context_gaps` text — asserted by visible text, not by class name.
3. `null` (never derived) renders the empty state, not a blank card.

Queries follow the `getByRole` → `getByLabelText` → `getByText` priority;
`getByTestId` only as a last resort.
