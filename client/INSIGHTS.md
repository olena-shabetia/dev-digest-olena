# INSIGHTS — client

Append-only, newest entry first per section. See the `engineering-insights`
skill for the read/write/promotion contract.

---

## What Works

_None yet._

## What Doesn't Work

_None yet._

## Codebase Patterns

### 2026-09-18 — promote a component to `client/src/components/` on its second consumer, not before

**Context:** the findings hover popover (trigger timers/focus/Escape/scroll-close
mechanics + the read-only preview panel) was built for the PR-list
`FindingsCell` only. When the run Timeline tiles needed the identical
"N FINDINGS IN THIS RUN" popover, the code was moved out to
`client/src/components/findings-popover/` (`FindingsPopover.tsx`,
`useFindingsHoverPopover.ts`, `helpers.ts`) rather than duplicated into
`RunHistory.tsx`.

**Decision:** promote a page-local component to the shared `client/src/components/`
layer exactly when a second page needs it — not speculatively when writing the
first consumer. `run-cost-badge` (L01) and `severity-filter-bar` (L02) were
promoted for the same reason, at the same trigger point.

**Why:** promoting on the first write means guessing at a shared shape before
a second real caller exists to validate it; duplicating past the second
caller means the two copies silently drift (see the `SEV_COLOR` entry below
for what that drift looks like once it happens).

**Rule:** when a `_components/<Name>/` folder's contents are about to be
needed by a second route, move it to `client/src/components/<name>/` in the
same change that adds the second usage — don't duplicate "for now" and don't
pre-promote "in case."

### 2026-09-18 — a filter's count badge must be derived at the same pipeline stage the filter itself reads from

**Context:** the run-card severity pills (`FindingsPanel.tsx`) must satisfy
"the pill's number always equals the number of finding cards its own click
leaves visible," while the panel already had an independent "Hide low
confidence" filter (`hideLow`).

**Decision:** counts are computed *after* the confidence filter and *before*
the severity filter — `findings → confidenceFiltered(hideLow) → [count here]
→ bySeverity(active) → rendered cards` (`FindingsPanel.tsx:37-42`) — not from
the raw `findings` prop.

**Why:** counting from the raw array lets a pill show a stale N while
`hideLow` silently removes matching cards underneath it — including the
"pill says 3, list renders empty" case when every finding of that severity is
below the confidence threshold.

**Rule:** in any multi-filter UI with a count badge, derive the count at the
exact composition point where the badge's own click would apply the next
filter — never from an earlier or later stage of the pipeline.

### 2026-09-17 — `src/vendor/shared` has drifted from the server copy

**Symptom:** a contract that exists on the server is missing or narrower here.
Five files differ: `adapters.ts`, `contracts/trace.ts`, `contracts/knowledge.ts`,
`contracts/eval-ci.ts`, `contracts/productionize.ts`.

**Cause:** `@devdigest/shared` is vendored twice because Next.js cannot import
across the package root. The server copy is canonical and has moved ahead:
it adds `sessionId` on the LLM call options, `'openrouter'` in `LLMProvider.id`,
`CommitFile`/`CommitFilesPayload`, and the `AgentManifest` schema.

**Fix:** none applied — the drift sits in server-side adapter interfaces and in
contracts for lessons not yet built (e.g. `PluginAgent` from L08). Verified that
the `Provider` enum the UI actually consumes is identical in both copies and does
include `openrouter`, so nothing user-facing is affected today.

**Rule:** before editing anything under `src/vendor/shared`, diff it against
`server/src/vendor/shared`. Change the server copy first, then sync here —
otherwise the gap widens silently.

## Tool & Library Notes

### 2026-09-18 — `next-intl`'s `{count}` interpolation does not add thousands separators

**Symptom:** a message like `"tokens": "{count} tok"` rendered via
`t("timeline.tokens", { count: 9119 })` outputs `9119 tok`, not `9,119 tok`,
even though the design calls for a grouped number.

**Cause:** plain ICU interpolation (`{count}`) just calls the value's
`toString()`. Locale-aware number formatting only kicks in for the explicit
`{count, number}` skeleton — a bare variable placeholder never formats,
regardless of the value's type.

**Fix:** pre-format the number in code (e.g. `n.toLocaleString("en-US")`) and
pass the already-formatted *string* as the interpolation value, rather than
relying on the message key to format a raw number. Done for the run-timeline
token count: `formatTokenCount` at `client/src/lib/format.ts:37`, called from
`RunHistory.tsx:206` before it's passed into `t("timeline.tokens", {count})`
at `RunHistory.tsx:205`.

**Rule:** when a message key interpolates a number that needs locale
formatting (thousands separators, decimals, etc.), format it in code and pass
a string — don't expect `{var}` alone to do it.

## Recurring Errors & Fixes

### 2026-09-18 — a hand-rolled severity color map drifted from the canonical `SEV` tokens

**Symptom:** the trace/log drawer's findings section (`FindingsSection.tsx`,
inside `RunTraceDrawer`) rendered severity as a plain `Badge` with no icon,
`bg="transparent"`, and its own local `SEV_COLOR` map that mapped `SUGGESTION`
to `var(--accent)` — visibly inconsistent with every other severity chip in
the app (icon + tinted background), and factually wrong for that one severity.
Reported by the user as "the finding icons' styles differ" after comparing two
screenshots.

**Cause:** severity is rendered in at least four places (`FindingCard`, the
PR-list `FindingsCell`, `SeverityFilterBar`'s Timeline/list chips, and this
trace-drawer section), and this one was written before — or without noticing
— the vendored `SEV` tokens (`client/src/vendor/ui/primitives/tokens.ts`) and
`SeverityBadge` (`Badge.tsx`) existed as the canonical source.

**Fix:** replaced the local map + bare `Badge` with `SeverityBadge` from
`@devdigest/ui`, same as `FindingCard` and `FindingsPopover` already use.

**Rule:** before adding any severity-colored UI, grep for `SEV\[` /
`SeverityBadge` first. A new `Record<Severity, string>` color map anywhere
outside `tokens.ts` is the bug, not a legitimate one-off style.

## Session Notes

_None yet._

## Open Questions

_None yet._
