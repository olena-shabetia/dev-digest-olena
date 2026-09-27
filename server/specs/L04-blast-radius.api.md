# L04 — Blast Radius (server)

Package-local API contract. See the cross-package spec
`../../specs/L04-blast-radius.md` for the full feature scope, the flow
diagram, and the degraded semantics; this file covers the server-side
contract and the reasoning behind it. Reference implementation mirrored
throughout: `modules/smart-diff/{routes,service}.ts` (the exact "no
container getter, service constructed inline" pattern — see
`server/specs/L03-smart-diff.api.md` "Why there is no
`container.smartDiff*` getter").

## Route table

New `blast` module — `server/src/modules/blast/{routes,service,helpers}.ts`,
registered with **one import + one entry** in `server/src/modules/index.ts`
(registration is STATIC, never autoload — `server/AGENTS.md`).

| Method | Path | Params | Body | Response | Errors |
|---|---|---|---|---|---|
| `GET` | `/pulls/:id/blast` | `IdParams` (`modules/_shared/schemas.ts`) | — | `200: BlastRadiusResponse` | 404 `NotFoundError('Pull request not found')` (workspace-scoped `getPull` miss); 422 for a non-uuid id |

- Workspace scoping via `getContext(container, req)` then
  `container.reviewRepo.getPull(workspaceId, prId)`; a missing PR raises
  `NotFoundError('Pull request not found')` (404).
- No per-route rate limit; the global 120/min applies. It is a read, like
  `GET /pulls/:id/smart-diff`.
- `routes.ts` is HTTP + Zod only: a default Fastify plugin,
  `withTypeProvider<ZodTypeProvider>()`, `new BlastService(container)`
  constructed inline inside the plugin (mirrors `smart-diff/routes.ts`), one
  `app.get` declaring `{ schema: { params: IdParams, response: { 200:
  BlastRadiusResponse } } }`. Zero business logic in this file.

## Data access — `container.reviewRepo` and `container.repoIntel` only

`BlastService` reads through two existing container surfaces — no new
repository method, no new container getter, and — because `blast` owns no
table of its own — **no `repository.ts` file in this module at all**:

- `container.reviewRepo.getPull(workspaceId, prId)` — workspace-scoped PR
  lookup; a miss throws `NotFoundError`.
- `container.reviewRepo.getPrFiles(prId)` — the same source `smart-diff`
  uses for changed files; mapped to `paths = files.map(f => f.path)`.
  `pr_files` is populated by a prior `GET /pulls/:id`
  (`pulls/routes.ts:175-190` already persists/refreshes it), so on the
  normal UI path the files are present by the time the card fetches.
- `container.repoIntel.getBlastRadius(pull.repoId, paths)` — called
  **exactly once**, wrapped in try/catch. Every `repoIntel.*` call is
  best-effort by design (`server/AGENTS.md`); a throw is mapped to
  `{ changedSymbols: [], callers: [], impactedEndpoints: [], degraded: true,
  reason: 'index_failed' }` rather than propagating. It never becomes a 500.

`blast/service.ts` issues **zero SQL** directly and imports `Container` only
as `import type`.

## Contracts (`vendor/shared/contracts/`)

Owned by WU-1 (server contract unit), append-only to
`contracts/review-api.ts`. Full text is frozen in the cross-package spec's
"The contract" section (`../../specs/L04-blast-radius.md`) — do not
transcribe it a second time here; that file is the byte-identical copy of
the implementation plan's §3. In summary: `BlastFileFacts`, `BlastStats`,
and `BlastRadiusResponse = BlastRadius.extend({...})` — a **flat**
extension, so every `BlastRadiusResponse` is also a valid `BlastRadius`
(Zod 3 strips the extra keys). `BlastRadius` itself is unchanged, so
`PrBrief` (which embeds it) is unaffected.

`BlastRadiusResponse` reuses the existing `RepoIndexDegradedReason` enum
(`contracts/platform.ts:300`, same 5 values as repo-intel's own
`DegradedReason`) — no new reason enum.

## Mapping algorithm — frozen, implemented in `blast/helpers.ts`

Verbatim in the cross-package spec; restated here as the file layout:

- `blast/helpers.ts` exports:
  - a local structural `interface BlastResultInput`, mirroring the
    repo-intel facade's `BlastResult` field-for-field (`changedSymbols`,
    `callers`, `impactedEndpoints`, `factsByFile?`, `degraded?`, `reason?:
    BlastRadiusResponse['reason'] | undefined`) — declared locally, **never**
    imported from `../repo-intel/types.ts`, not even as `import type`
    (`tsPreCompilationDeps: true` in `.dependency-cruiser.cjs` treats a
    type-only import as a real edge). This mirrors `intent/helpers.ts`'s own
    local structural input type.
  - `toBlastRadiusResponse(input: BlastResultInput): BlastRadiusResponse`
  - `buildBlastSummary(stats: BlastStats): string`
  - its only imports are `import type { BlastRadiusResponse, BlastStats,
    DownstreamImpact } from '@devdigest/shared'`.

Algorithm (1–8), summarized — full text in the cross-package spec:

1. `changed_symbols` = `changedSymbols` mapped to `{name, file, kind}`, input
   order preserved.
2. `callers` grouped by `viaSymbol` (first-seen group order, within-group
   input order preserved — the facade already ranks callers) into one
   `DownstreamImpact` per group, with `endpoints_affected`/`crons_affected`
   as sorted, de-duplicated unions of `factsByFile?.[file]?.{endpoints,
   crons}` over the group's caller files.
3. `downstream` sorted by `callers.length` desc, then `symbol`
   `localeCompare` asc. Only symbols with ≥1 caller appear.
4. Top-level `endpoints`/`crons` = sorted, de-duplicated unions across
   `impactedEndpoints` plus every group's `*_affected` arrays.
5. `facts_by_file` restricted to caller files actually present in
   `factsByFile` (`{}` when `factsByFile` is undefined) — **not** every
   changed file, and not every file in the facade's full index.
6. `stats` = `{ symbols, callers: Σ downstream[i].callers.length, endpoints:
   endpoints.length, crons: crons.length }`.
7. `summary` = the fixed English template built from `stats`, no model call,
   no degraded suffix.
8. `degraded` = `input.degraded === true`; `reason` = `degraded ?
   (input.reason ?? 'no_data') : null` — **never `undefined`**.

## Response invariants the handler must satisfy literally

- `reason` is written **explicitly** as `null` when not degraded — never
  omitted, never `undefined`. Per `server/INSIGHTS.md` (2026-09-21):
  `fastify-type-provider-zod` runs `safeParse` on the in-memory object
  **before** `JSON.stringify` — an undeclared/`undefined` key can vanish
  silently or 500, depending on the schema shape, so every field of
  `BlastRadiusResponse` must be a JSON primitive, array, or record of
  arrays, with no raw `Date` anywhere in the payload.
- `facts_by_file` only carries caller files, never every changed file (D6 in
  the plan) — it is the only way a consumer can draw accurate
  `caller → endpoint` edges without a caller-to-endpoint cross product.
- Top-level `endpoints` is the union of `impactedEndpoints` and every
  per-symbol `endpoints_affected` (D7): the facade's degraded ripgrep path
  returns `impactedEndpoints` but **no** `factsByFile`, so per-symbol
  attribution is impossible there, and the union is what keeps those
  endpoints visible to a consumer at all.
- A facade failure is **never** a non-2xx response — it degrades to
  `{ degraded: true, reason: 'index_failed' }` with empty arrays, exactly
  like a real "no callers found" result shape-wise.

## Why there is no `container.blast*` getter

Nothing outside `blast/` consumes `BlastService`, so `routes.ts` constructs
`new BlastService(container)` inline — exactly as `smart-diff/routes.ts`
does — and `platform/container.ts` is never touched. A `Service(container)`
plus a `container.ts` getter for it would form the `no-circular`
dependency-cruiser violation described in `server/INSIGHTS.md`
(2026-09-22); adding a getter here "for symmetry" would buy a
known-violations edit for zero callers.

## No schema delta, no migration, no container getter, no baseline edit

Explicit, because every one of these is normally expected of a new server
feature and this one deliberately has none:

- **No DB schema change.** No new table, column, index, or migration under
  `server/src/db/**`. Blast Radius is derived, computed per request from
  `pr_files` (already persisted) and the repo-intel index (already built) —
  it stores nothing. No unit in this plan runs `pnpm db:generate` or
  `pnpm db:migrate`.
- **No new container getter.** See above.
- **No `server/.dependency-cruiser-known-violations.json` edit.** Because
  there is no container getter, the `no-circular` cycle that would justify a
  baseline entry never forms. `pnpm arch` (main-thread only, after wave 2)
  is expected to report zero new violations and an unchanged
  known-violations count.

## Known facade limits (read-only here; repo-intel is out of scope)

1. **Caller cap is total, not per symbol.** The persistent path caps
   callers at `MAX_CALLERS_PER_SYMBOL` (20) **in total**
   (`repo-intel/service.ts:386`), not per changed symbol, so a PR with many
   changed symbols shows at most 20 callers overall. This is a facade
   behaviour, not a `blast` module bug.
2. **The ripgrep fallback path is uncapped.** When the persistent index is
   unavailable, the degraded ripgrep-based path can return an unbounded
   caller list. `blast/helpers.ts` does not cap it server-side (capping is
   the facade's job and is out of scope for this feature) — the MCP
   formatter and the client's graph layout each apply their own caps so
   large responses stay bounded for their respective consumers.

Neither limit is fixed in this feature; both are recorded here so a future
change to `repo-intel` has a pointer to what currently depends on the
behaviour.

## Tests

- `test/blast-helpers.test.ts` (hermetic) — written **before**
  `helpers.ts` exists, transcribing the mapping algorithm's cases: a
  persistent-path input with `factsByFile` (grouping, sort order, per-symbol
  endpoints/crons, `facts_by_file` restricted to caller files, `stats`, the
  exact `summary` string, `reason: null`); a degraded ripgrep-shaped input
  with no `factsByFile` and a non-empty `impactedEndpoints` (per-symbol
  endpoints `[]`, non-empty top-level `endpoints`, `reason: 'no_data'`); a
  `degraded: true` input with no `reason` (defaults to `'no_data'`); an
  all-empty input (zero stats, `downstream: []`).
- `test/blast-service.test.ts` (hermetic) — a stub `Container` (cast
  `as unknown as Container`) with `reviewRepo.getPull`/`getPrFiles` and
  `repoIntel.getBlastRadius` as `vi.fn`: a missing pull rejects with
  `NotFoundError`; the facade is called exactly once with
  `(repoId, paths)`; a throwing facade yields `{ degraded: true, reason:
  'index_failed' }` and does not reject.
- `test/blast.it.test.ts` — DB-backed (testcontainers Postgres), mirroring
  `smart-diff.it.test.ts`'s `dockerAvailable` guard. Written in this plan;
  **not run** by any unit — main thread only, per `server/AGENTS.md`'s
  test-split convention (`*.it.test.ts` vs. hermetic). Covers: (a) 200 with
  body deep-equal to the helper's expected output, using an `overrides: {
  repoIntel: <inline stub> }` seam rather than the real index; (b) an
  unknown uuid → 404; (c) a non-uuid → 422.

See also: `../../specs/L04-blast-radius.md`, `../../client/specs/L04-blast-radius.ui.md`,
`../specs/L03-smart-diff.api.md` (the sibling "no container getter" pattern
this module mirrors).
