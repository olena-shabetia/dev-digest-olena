# L01 — Run cost badge

Cross-package spec. Implementation plan: see PR description / commit history
around this spec's introduction; this file is the binding contract for the
*shape* of the feature, per root `CLAUDE.md`'s "write the spec first" rule.

## Problem

DevDigest runs LLM reviews and never shows what they cost. The dollar amount is
computed per LLM call and summed per run inside `reviewer-core`
(`ReviewOutcome.costUsd`), but the value is discarded before it reaches the
database or the UI (removed end-to-end by commit `d45ab0d`).

## Scope — three surfaces

1. **PR list** (`/repos/:repoId/pulls`) — a `COST` column showing the **sum of
   all runs** for that PR.
2. **Run timeline** (PR detail → Findings tab) — each run row shows
   `<tokens> tok · <cost>`, e.g. `9,119 tok · $0.0013`.
3. **Run trace drawer** — a 4th `COST` stat tile alongside DURATION / TOKENS /
   FINDINGS.

Explicitly **out of scope**: a cost line in the PR-detail verdict banner
(`ReviewRecord` has neither tokens nor cost today — would need its own
contract change or a client-side join by `run_id`).

## Price source

OpenRouter's `usage.cost` (the real billed amount) when available, falling back
to the existing `PriceBook` (live `/models` prices, 6h TTL) and then the static
`pricing.ts` table. No new pricing computation — `reviewer-core` already
produces a final `costUsd: number | null` per run; this feature only persists
and displays it.

## Storage

`cost_usd` (`double precision`, nullable) on `agent_runs`, written once at run
completion — a snapshot, not a live recomputation. Historical runs must not
change value if prices change later.

## Null semantics

`costUsd` is `null` when the underlying cost of any contributing LLM call was
unknown (e.g. an unrecognized model with a cold `PriceBook` and no static-table
entry). `null` propagates through summation (one unknown chunk makes the whole
run's cost unknown) and through the PR-level `SUM` (all-null rows sum to `null`).
**Null renders as `—`, never `$0.00`.** Treating "unknown" as "free" is the bug
this feature must not reintroduce.

## Display format — `formatCost`

Adaptive precision, single shared implementation (`client/src/lib/format.ts`):

| Range | Precision | Example |
|---|---|---|
| `< $0.01` | 4 decimal places | `$0.0013` |
| `$0.01 – $9.99` | 3 decimal places | `$0.014` |
| `≥ $10` | 2 decimal places | `$12.40` |
| `null` / `undefined` | — | `—` |

Token counts use `formatTokenCount` (thousands separator, e.g. `9,119`) in the
timeline row, and the existing compact `formatTokens` (`8.2K→1.3K`) in the
drawer tile.

## Non-goals

- No new model-pricing tables or estimation logic.
- No metering, billing enforcement, or budget alerts.
- No per-agent or per-workspace cost dashboards (tracked separately as
  `AgentStats.total_cost_usd` — contract exists, unimplemented).
- OpenAI/Anthropic adapters keep using the static pricing table; only the
  OpenRouter path gets billed-accurate cost.
