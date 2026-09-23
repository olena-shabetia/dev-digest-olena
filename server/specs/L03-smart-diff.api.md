# L03 — Smart Diff (server)

Package-local API contract. See the cross-package spec
`../../specs/L03-smart-diff.md` for the full feature scope, the flow diagram,
and the acceptance criteria; this file covers the server-side contract and the
reasoning behind it. Reference implementation mirrored throughout:
`modules/intent/routes.ts` (a same-shape "no container getter, service
constructed inline" module — see `server/specs/L03-intent-layer.api.md`).

## Route table

New `smart-diff` module —
`server/src/modules/smart-diff/{routes,service,helpers,constants}.ts`,
registered with **one import + one entry** in `server/src/modules/index.ts`
(registration is STATIC, never autoload — `server/AGENTS.md`; the registry
comment at `index.ts:24` already lists "intent/smart-diff" as expected).

| Method | Path | Params | Body | Response |
|---|---|---|---|---|
| `GET` | `/pulls/:id/smart-diff` | `IdParams` (`modules/_shared/schemas.ts`) | — | `200: SmartDiffResponse` |

- Workspace scoping via `getContext(container, req)` then
  `container.reviewRepo.getPull(workspaceId, prId)`; a missing PR raises
  `NotFoundError('Pull request not found')` (404).
- No rate limit — this is a pure, cheap read like `GET /pulls/:id/intent`,
  safe to poll.
- `routes.ts` is HTTP + Zod only: a default Fastify plugin,
  `withTypeProvider<ZodTypeProvider>()`, `new SmartDiffService(container)`
  constructed inline inside the plugin (mirrors `intent/routes.ts:24`), one
  `app.get` declaring `{ schema: { params: IdParams, response: { 200:
  SmartDiffResponse } } }`. Zero business logic in this file.

## Data access — `container.reviewRepo` only

`SmartDiffService` reads through the existing `reviews/repository.ts`
surface — `getPull(workspaceId, prId)`, `getPrFiles(prId)`,
`reviewsForPull(prId)` (`server/src/modules/reviews/repository.ts:32,40,65`).
No new repository method, no new container getter, and — because `smart-diff`
owns no table of its own — **no `repository.ts` file in this module at all**.
Every query stays scoped by `workspace_id` exactly as it already is in
`reviews/repository.ts`; `smart-diff/service.ts` issues **zero SQL** directly.

Findings come from the PR's **latest** review only: `reviewsForPull` returns
newest-first, so `reviewsForPull(prId)[0]`. No review yet ⇒ every file's
`finding_lines` is `[]`.

`pr_files` is populated by a prior `GET /pulls/:id` (`pulls/routes.ts:175-190`
already persists/refreshes it). Smart Diff never calls GitHub itself; a PR
whose files were never fetched yields five empty groups and `total_lines: 0`
— a valid response, not an error.

## Contracts (`vendor/shared/contracts/`)

`contracts/brief.ts:103-135` — the **only** change in this plan is widening
the existing enum, in exactly this value order:

```ts
export const SmartDiffRole = z.enum(['core', 'tests', 'wiring', 'docs', 'boilerplate']);
export type SmartDiffRole = z.infer<typeof SmartDiffRole>;
```

Unchanged, kept verbatim: `SmartDiffFile` (`path`, `pseudocode_summary:
z.string().nullish()`, `additions`, `deletions`, `finding_lines`),
`SmartDiffGroup` (`role`, `files`), `ProposedSplit` (`name`, `files`),
`SmartDiff` (`groups`, `split_suggestion: { too_big, total_lines,
proposed_splits }`). Unchanged and already exported: `SmartDiffResponse =
SmartDiff` and its inferred type (`contracts/review-api.ts:75-76`).

## Response invariants the handler must satisfy literally

- `groups` has **exactly 5 entries, always**, in this order: `core, tests,
  wiring, docs, boilerplate`. A role with no files still ships `files: []` —
  never a missing entry.
- Within a group, files keep GitHub's original relative order (the order
  `pr_files` was persisted in), never re-sorted by name or size.
- Each file is emitted as `{ path, pseudocode_summary: null, additions,
  deletions, finding_lines }`. `pseudocode_summary` is written **explicitly
  as `null`** — never omitted, never a `Date`, never an extra key. Per
  `server/INSIGHTS.md` (2026-09-21): `fastify-type-provider-zod` runs
  `safeParse` on the in-memory object **before** `JSON.stringify` — an
  undeclared key vanishes silently, but a declared-and-mistyped value 500s.
  Omitting `pseudocode_summary` entirely would (today) pass `.nullish()`, but
  a later lesson that tightens this field to required-nullable would then
  break silently on an omitted key; writing `null` explicitly is the only
  form that is correct under both.
- `finding_lines`: the latest review's findings whose `file === path`, mapped
  to `start_line`, de-duplicated, sorted ascending. `[]` when there is no
  review for the PR yet.
- `split_suggestion`: `{ too_big: false, total_lines: <sum of additions +
  deletions across every file in every group>, proposed_splits: [] }`. No
  splitting heuristic in this plan — see the cross-package spec's "Out of
  scope".

## Path classification — frozen algorithm

Pure, synchronous, no I/O, importable standalone (no `Container`, no Fastify,
no Drizzle):

```ts
export function classifyFile(path: string): SmartDiffRole
```

Lives in `smart-diff/constants.ts` (the pattern literals — arrays/regexes
only, no imports beyond the `SmartDiffRole` type, so the file satisfies
`.dependency-cruiser.cjs`'s `helpers-and-constants-are-pure` rule) +
`smart-diff/helpers.ts` (the function itself).

Normalization (frozen): `const hay = ('/' + path).toLowerCase()`, and
`base = hay.slice(hay.lastIndexOf('/') + 1)`. Input is a POSIX,
repo-root-relative path exactly as GitHub reports it. Matching is
**first-match-wins in this rule order**; within a rule, any sub-pattern
matching is enough:

1. **boilerplate** — `hay.endsWith('.lock')` · `base` ∈ {`pnpm-lock.yaml`,
   `package-lock.json`, `yarn.lock`} · `hay.includes('/dist/')` ·
   `hay.includes('/build/')` · `hay.includes('/snapshots/')` ·
   `hay.includes('/__snapshots__/')` · `hay.endsWith('.snap')` ·
   `hay.includes('.generated.')` · `hay.endsWith('.min.js')`
2. **tests** — `/\.(it\.)?test\.tsx?$/.test(hay)` · `hay.endsWith('.spec.ts')`
   · `hay.endsWith('.spec.tsx')` · `hay.includes('/test/')` ·
   `hay.includes('/tests/')` · `hay.includes('/__tests__/')` ·
   `hay.startsWith('/e2e/')`
3. **wiring** — `base` ∈ {`index.ts`, `index.js`} · `hay.includes('.config.')`
   · `/^tsconfig.*\.json$/.test(base)` · `base.startsWith('.eslintrc')` ·
   `base.startsWith('.env')` · `/^docker-compose.*\.ya?ml$/.test(base)` ·
   `hay.startsWith('/.github/')` · `hay.startsWith('/.claude/')`
4. **docs** — `hay.endsWith('.md')` · `hay.includes('/docs/')` ·
   `base.startsWith('readme')` · `base.startsWith('changelog')` ·
   `base.startsWith('license')`
5. **core** — everything else.

## Path → role test table (must be written BEFORE the implementation)

`server/test/smart-diff-classify.test.ts` transcribes this table as its
**first** step (one `it.each`-style table test), then the implementation is
written against it. The table is the contract: a row is never edited to match
the code. Rows marked ★ are the three documented edge cases; rows marked ◆
are the four categories the user's GitHub test PR must contain.

| path | role | why |
|---|---|---|
| `server/pnpm-lock.yaml` ◆ | boilerplate | rule 1, exact basename |
| `client/pnpm-lock.yaml` | boilerplate | rule 1 |
| `reviewer-core/package-lock.json` | boilerplate | rule 1 |
| `web/yarn.lock` | boilerplate | rule 1 |
| `poetry.lock` | boilerplate | rule 1, `.lock` suffix |
| `server/dist/server.js` | boilerplate | rule 1, `/dist/` |
| `client/build/index.html` | boilerplate | rule 1, `/build/` |
| `client/src/x/__snapshots__/x.snap` ★ | boilerplate | rule 1 `.snap` + `/__snapshots__/` fire before rule 2's `/__tests__/`-style test rules — the snapshot rule precedes the test rule |
| `src/api.generated.ts` | boilerplate | rule 1, `.generated.` |
| `public/vendor/jquery.min.js` | boilerplate | rule 1, `.min.js` |
| `server/test/smart-diff-classify.test.ts` ◆ | tests | rule 2 |
| `server/test/reviews.it.test.ts` | tests | rule 2, `.it.test.ts` |
| `client/src/components/x/X.test.tsx` | tests | rule 2 |
| `src/lib/format.spec.ts` | tests | rule 2 |
| `server/test/helpers/db.ts` | tests | rule 2 `/test/` beats rule 3 — a helper inside a test dir is test material |
| `server/test/helpers/index.ts` | tests | rule 2 precedes rule 3's barrel rule |
| `packages/x/tests/thing.ts` | tests | rule 2, `/tests/` |
| `e2e/specs/05-pr-diff.flow.json` | tests | rule 2, `/e2e/` prefix |
| `e2e/README.md` ★ | tests | rule 2's `/e2e/` prefix precedes rule 4's `.md` — the whole `e2e` package is test material, so its readme is graded with it (deliberate; see "Open question" below) |
| `e2e/playwright.config.ts` | tests | rule 2 precedes rule 3's `.config.` |
| `server/src/modules/index.ts` ◆ | wiring | rule 3, barrel |
| `client/src/components/diff-viewer/index.ts` | wiring | rule 3, barrel |
| `client/next.config.ts` | wiring | rule 3, `.config.` |
| `server/tsconfig.json` | wiring | rule 3 |
| `client/tsconfig.build.json` | wiring | rule 3 |
| `.eslintrc.cjs` | wiring | rule 3 |
| `server/.env.example` | wiring | rule 3 |
| `docker-compose.yml` ◆ | wiring | rule 3 |
| `.github/workflows/repo-gates.yml` | wiring | rule 3 |
| `.claude/skills/security/SKILL.md` ★ | wiring | rule 3's `/.claude/` precedes rule 4's `.md` |
| `README.md` | docs | rule 4 |
| `CHANGELOG.md` | docs | rule 4 |
| `LICENSE` | docs | rule 4 |
| `docs/agent-prompts/README.md` | docs | rule 4 |
| `specs/L03-smart-diff.md` | docs | rule 4, `.md` |
| `server/src/modules/smart-diff/service.ts` ◆ | core | rule 5 |
| `client/src/app/repos/[repoId]/pulls/[number]/page.tsx` | core | rule 5 |
| `server/src/db/schema/reviews.ts` | core | rule 5 |
| `src/middleware/ratelimit.ts` | core | rule 5 |

### Open question (non-blocking), documented per the table's `e2e/README.md` row

Rule 2's `/e2e/` prefix classifying `e2e/README.md` as `tests` (not `docs`) is
a deliberate call: the whole `e2e` package is test material, so its readme is
graded with it. The alternative — moving the `.md` rule above the `/e2e/`
rule so any README is always `docs` — was rejected because it would also drag
`.github/**/*.md` and `.claude/**/*.md` out of `wiring`, which is a larger
behavior change than this plan intends.

## Why there is no `container.smartDiff*` getter

Nothing outside `smart-diff/` consumes `SmartDiffService`, so `routes.ts`
constructs `new SmartDiffService(container)` inline — exactly as
`intent/routes.ts:24` does — and `platform/container.ts` is never touched. A
`Service(container)` plus a `container.ts` getter for it would form the
`no-circular` dependency-cruiser violation described in `server/INSIGHTS.md`
(2026-09-22); adding a getter here "for symmetry" would buy a
known-violations edit for zero callers. If a future lesson adds a real
consumer outside this module, that is the point at which a getter earns its
keep — not before.

## No schema delta, no migration, no container getter, no baseline edit

Explicit, because every one of these is normally expected of a new server
feature and this one deliberately has none:

- **No DB schema change.** No new table, column, index, or migration under
  `server/src/db/**`. Smart Diff is derived, computed per request from
  `pr_files` and `findings` that already exist — it stores nothing. No unit
  in this plan runs `pnpm db:generate` or `pnpm db:migrate`.
- **No new container getter.** See above — `routes.ts` builds the service
  inline, matching the `intent` module's own pattern.
- **No `server/.dependency-cruiser-known-violations.json` edit.** Because
  there is no container getter, the `no-circular` cycle that would justify a
  baseline entry never forms. `pnpm arch` (main-thread only, after wave 2) is
  expected to report zero new violations and an unchanged known-violations
  count.

## Response-schema discipline

`GET /pulls/:id/smart-diff` declares an explicit `response: { 200:
SmartDiffResponse }` and the handler returns a plain object built entirely
from `toSmartDiffFile`/`service.ts` mapping — never a raw Drizzle row. Per
`server/INSIGHTS.md` (2026-09-21), `fastify-type-provider-zod` runs
`safeParse` on the in-memory object **before** `JSON.stringify`: a raw `Date`
anywhere in the payload 500s, and an undeclared key silently vanishes rather
than erroring. `pseudocode_summary: null` is written explicitly for exactly
this reason (see "Response invariants" above).

## Tests

- `test/smart-diff-classify.test.ts` (hermetic) — transcribes the full
  path→role table above, written **before** `helpers.ts`/`constants.ts`
  exist, so it fails first and passes only once `classifyFile` is correct.
  Each ★ row's assertion carries a comment naming the rule that wins and why.
- `test/smart-diff.it.test.ts` — DB-backed happy path (seeded PR with files
  and a review): asserts five groups in the frozen order, a known file's
  `finding_lines`, and `split_suggestion.total_lines`. Written in this plan;
  **not run** by any unit — it needs Docker (testcontainers Postgres), main
  thread only, per `server/AGENTS.md`'s test-split convention
  (`*.it.test.ts` vs. hermetic).

See also: `../../specs/L03-smart-diff.md`, `../../client/specs/L03-smart-diff.ui.md`,
`review-flow.md` (the run/review data this module reads).
