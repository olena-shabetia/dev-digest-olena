# spec: the review-run flow, end to end

The contract from "click Review" to a persisted, scored review. If a change
breaks a rule below, that's a regression. See `../docs/architecture.md` for
how the DI container resolves the adapters this flow uses.

## Trigger and immediate response

`POST /pulls/:id/review` (`src/modules/reviews/routes.ts`) resolves targets
via `ReviewService.resolveTargets`, then calls `ReviewService.runReview`.

- `runReview` creates the `agent_runs` row(s) **up front**, with
  `status: 'running'` immediately (`run.repo.ts`, `createAgentRun`). There is
  **no `pending` state** — a run is `running` from the moment it's created.
- `executor.executeRuns(...)` is fired **without being awaited**
  (fire-and-forget); the route returns the new run ids right away so the
  client can subscribe over SSE (`runBus`) instead of blocking on the HTTP
  response.

**Rule:** do not add an `await` in front of `executeRuns` in the route — the
whole point of returning immediately is that a review can take much longer
than an HTTP request should stay open.

## Per-agent execution

`ReviewRunExecutor.executeRuns` (`run-executor.ts`) loads the diff once
(`loadDiff`), then runs each agent independently via `runOneAgent`.

Inside `runOneAgent`:

1. Resolve the LLM via `container.llm(agent.provider)` — the provider/model
   named on the **agent row**, not whichever secret happens to be configured
   (see `../INSIGHTS.md` — the seeded agents default to `openrouter`).
2. **Repo-intel enrichment is best-effort and per-agent gated**
   (`agent.repoIntel !== false`). `buildCallersDigest`, `buildRepoMapDigest`,
   and `buildRankNote` are each wrapped in try/catch and degrade to
   `undefined`/`''` on failure or when disabled.
3. Call `reviewPullRequest(...)` from `@devdigest/reviewer-core`, which
   assembles the prompt, calls the LLM, sums `costUsd` across chunks, and
   applies the grounding gate (`reviewer-core/src/grounding.ts` —
   see `reviewer-core/specs/prompt-and-grounding.md`).

**Invariant (do not break):** when `REPO_INTEL_ENABLED=false` or
`agent.repoIntel === false`, the assembled prompt must be byte-for-byte
identical to the pre-repo-intel shape — this is what makes review results
comparable with and without repo-intel. Every `repoIntel.*` call in this path
must stay wrapped in try/catch; an enrichment failure must degrade the prompt
section, never fail the run.

## Persistence and run lifecycle

After `reviewPullRequest` returns:

- `repo.insertReview` + `repo.insertFindings` persist the grounded review and
  its findings.
- `repo.markReviewed` flags the PR.
- `countBlockers` counts CRITICAL findings for the run summary.
- `repo.completeAgentRun` transitions the run to its terminal state —
  `'done'` / `'failed'` / `'cancelled'` — and stores `costUsd`,
  `tokensIn`/`tokensOut`, `score`, and `blockers` on the `agent_runs` row.
- `repo.saveRunTrace` persists the full `RunTrace`, including
  `stats.cost_usd`, for the run-trace drawer / cost badge to read later.

**Lifecycle:** `running` (at creation) → `done` | `failed` | `cancelled`
(at completion). No `pending` state exists in this flow.

`cost_usd` is computed inside `reviewer-core` using `estimateCost` (server
`llm/pricing.ts`) or live OpenRouter pricing via `PriceBook`, then flows back
through `ReviewOutcome` to `completeAgentRun` — the server never computes
cost independently of what the engine reports.

## Stale-run reaping

Boot-time `reapStaleRunningRuns` (`run.repo.ts`, exposed via
`ReviewService.reapStaleRuns`) flips orphaned `running` rows to `failed` on
API startup. This assumes **one API instance per database** (see
`../CLAUDE.md`) — multiple replicas would double-reap or race, and would need
per-instance scoping or heartbeats before that assumption could be relaxed.
