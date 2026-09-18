# INSIGHTS — client

Append-only, newest entry first per section. See the `engineering-insights`
skill for the read/write/promotion contract.

---

## What Works

_None yet._

## What Doesn't Work

_None yet._

## Codebase Patterns

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

_None yet._

## Session Notes

_None yet._

## Open Questions

_None yet._
