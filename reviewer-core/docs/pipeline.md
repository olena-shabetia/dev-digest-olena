# reviewer-core — pipeline architecture

How `reviewPullRequest` turns a diff into grounded findings. For the
invariants this pipeline must never break, see `../CLAUDE.md`. For the
line-range grounding rules and the untrusted-input wrapping in detail, see
`../specs/prompt-and-grounding.md`.

## Entry point

`src/index.ts:38-47` re-exports `reviewPullRequest` from `src/review/run.ts:123`.

```
reviewPullRequest(input: ReviewInput): Promise<ReviewOutcome>
```

`ReviewInput` (`run.ts:44-93`) carries everything the engine needs and nothing
it fetches itself, per the zero-I/O invariant: `systemPrompt`, `model`, a
pre-parsed `diff: UnifiedDiff` (hunks already carry new-side line numbers —
diff *parsing* happens in the caller, not here), the injected `llm:
LLMProvider`, optional `repoMap`/`prDescription`/`skills`/`memory`/`specs`/
`callers` context, and the cooperative `checkCancelled?: () => void` hook.

`ReviewOutcome` (`run.ts:95-113`) returns the grounded `review` (findings +
score), a `grounding` summary, the `dropped` findings with reasons, which
`mode` ran, token/cost counters, and the `raw` model output.

## Stages, in order

All stages run inside `reviewPullRequest` (`run.ts:123-219`):

1. **Mode selection** — `selectMode` (`run.ts:115-121`). Map-reduce only
   kicks in when the diff exceeds a line threshold *and* spans more than one
   file; otherwise single-pass.
2. **Prompt assembly** — `assemblePrompt` (`src/prompt.ts:85`), called once
   per chunk (`run.ts:172`). Wraps every piece of external text
   (diff/PR body/repo-map/specs/callers) via `wrapUntrusted` and appends
   `INJECTION_GUARD` to the system prompt unconditionally.
3. **LLM call** — `input.llm.completeStructured<Review>(...)` (`run.ts:174-181`)
   against the injected `LLMProvider`. `reviewer-core` never picks a provider
   itself.
4. **Structured parsing** — `extractJson` (`src/llm/structured.ts:25`) and
   `parseWithRepair` (`structured.ts:54`), used inside provider
   implementations (e.g. `src/llm/openrouter.ts`) before results reach the
   pipeline.
5. **Reduce** — `reduceReviews` (`src/review/reduce.ts:43`), merging
   per-chunk results in map-reduce mode (`run.ts:190`). Its merged score is
   only used for interim logging (`run.ts:193`) — never persisted.
6. **Grounding gate** — `groundFindings` (`src/grounding.ts:52`), run at
   `run.ts:197`. Drops any finding whose claimed location doesn't survive
   against the real diff.
7. **Scoring** — `scoreFromFindings` (`reduce.ts:27`), called at
   `run.ts:208` against `ground.kept` — the post-grounding set, not the
   model's self-reported score. This is what keeps score, findings list, and
   emitted event in agreement by construction (see `../CLAUDE.md`).

## Cancellation

Cooperative only — no `AbortController` anywhere in this package.
`input.checkCancelled?.()` is called once per chunk, before each LLM call
(`run.ts:164`, inside the per-chunk loop), so a caller-supplied callback that
throws stops the pipeline between chunks, never mid-call.

## Where a caller plugs in

The server (`server/`) is the only current caller: it resolves the
`LLMProvider` via its DI container, parses the diff into `UnifiedDiff`
(`server/src/vendor/shared/adapters.ts:185`) before calling in, and persists
`ReviewOutcome` after. See `server/docs/architecture.md` for that side.
