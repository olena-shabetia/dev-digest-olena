# Spec: Onboarding Tour — server refinement
Spec ID: SPEC-06
Status: draft
Supersedes: none

Refines `../../specs/L05b-onboarding-tour.md` (SPEC-05). Scope, user stories
and the numbered cross-package criteria (AC-n) live there, and this file
must not contradict them. The planner freezes the exact route paths, type
names and DB columns (`implementation-planner` "Contract freeze"). The
shapes below are **proposals** that keep the feature consistent with
existing patterns. Criteria here are numbered `S-n`.

## Problem and user

INSIGHTS entries that bear on the server side (loaded this session):

- 2026-09-21: cross-module access goes through `container.<x>Repo` or the
  `container.repoIntel` facade. For a feature-model read, copy the
  repository-local override pattern (`conventions/repository.ts:76-84`); do
  not import `modules/settings/feature-models.ts` (see the comment at
  `intent/repository.ts:17`).
- 2026-09-21: the `fastify-type-provider-zod` response serializer strips
  undeclared keys and rejects `Date`. Map `generated_at` and index
  `updated_at` to ISO strings in `helpers.ts` before the schema sees them.
- 2026-09-21: a duplicate `export *` in the `vendor/shared` barrel is dropped
  silently. `Onboarding*` names already exist in `contracts/knowledge.ts:29-47`.
- 2026-09-21: a body-less POST arrives as `null`. The generate route takes
  no body. If one is added, use `z.preprocess`, not `.default()`.
- 2026-09-22: a Service ↔ `container.ts` cycle is expected. Add one
  hand-written baseline entry and never regenerate the baseline.
- 2026-09-21: `drizzle-kit generate`'s interactive prompt needs a pty. This
  is relevant because S-8 changes the `onboarding` table.
- 2026-09-17: `server/clones/` holds a full copy of this repo. When
  onboarding is tested against *this* repository, the clone must not live
  under `server/`, or the walk sees duplicates. The walk skips only
  `EXCLUDED_DIRS` (`repo-intel/constants.ts:17-26`), which does not include
  `clones`.

Root and reviewer-core INSIGHTS: none apply.

## Goals / Non-goals

Goals are those of SPEC-05. Server Non-goals, in addition to SPEC-05's:

- no change to `pipeline/rank.ts` output semantics (`rank = pagerank`
  stays);
- no change to `CLONE_DEPTH` for the initial clone;
- no new `AppConfig` key unless S-12 needs a kill switch (see S-12).

## User stories

See SPEC-05 US-1 to US-5.

## Acceptance criteria (EARS)

Module and layering

1. [Ubiquitous] The server shall implement the feature as a new module `src/modules/onboarding/` with `routes.ts` (HTTP + Zod only), `service.ts` (orchestration, zero SQL), `repository.ts` (Drizzle, every query scoped by `workspace_id`), `helpers.ts` (pure transforms: reading score, command builder, payload budgeter, row → DTO) and `constants.ts` (all caps and limits from SPEC-05 AC-9, 13, 15, 16, 21, 23, 48, 49). It shall be registered statically in `src/modules/index.ts`.
2. [Ubiquitous] The onboarding module shall import nothing from `src/modules/<other>/`. It shall reach repo-intel only through `container.repoIntel`, git only through `container.git`, LLMs only through `container.llm(provider)`, and jobs only through `container.jobs`.

Routes (proposed)

3. [Event-driven] WHEN `GET /repos/:id/onboarding` is called, the server shall return `{ state, tour, index }` and shall make no LLM call. Here:
   - `state` is `none` | `generating` | `ready` | `skeleton`;
   - `tour` is the persisted tour or `null`, with `stale` computed at read time (SPEC-05 AC-31);
   - `index` is `{ status, files_indexed, last_indexed_sha, updated_at, partial, bounded }` taken from `getIndexState` (SPEC-05 AC-43a).
4. [Event-driven] WHEN `POST /repos/:id/onboarding/generate` is called, the server shall return `202 { job_id, reused }` after enqueueing, or return the in-flight job with `reused: true` (SPEC-05 AC-40/41).
5. [Ubiquitous] Both routes shall declare `schema.params: IdParams` (`_shared/schemas.ts:11`) and a `response` schema for every status code they return.
6. [Unwanted behavior] IF the repo id does not belong to `getContext(...).workspaceId`, THEN both routes shall throw the existing `NotFoundError` (`platform/errors.js`), which becomes a 404 envelope (SPEC-05 AC-46a).

Contracts (canonical copy first)

7. [Ubiquitous] The server shall define the tour DTO in `server/src/vendor/shared/contracts/` by replacing the loose `Onboarding`/`OnboardingSection`/`OnboardingLink` (`knowledge.ts:29-47`, no current importers outside the barrel; the planner re-greps before changing them) with:
   - a discriminated section shape keyed by `kind`: `z.enum(['architecture','critical_paths','run_locally','reading_path','first_tasks'])`;
   - per-kind items:
     - critical path `{ path, reason: string | null }`;
     - command `{ command, comment: string | null }`;
     - reading item `{ path, rationale: string | null, score }`;
     - first task `{ title, detail, paths: string[], complexity: 'low' | 'medium' | 'high' }`;
   - architecture `{ prose: string | null, diagram: string | null, structure: {dir, files}[], stack: string[] }`;
   - tour meta `{ status, reason, index_sha, generated_at (ISO string), index_partial, ranking, dropped_components[], provider, model, llm_calls: number|null, tokens_in: number|null, tokens_out: number|null, cost_usd: number|null }`.

   Nullable fields use `.nullable()`, not `.optional()`, so that "unknown" is an explicit `null` (SPEC-05 AC-36/37). The derived copy under `client/src/vendor/shared/` is synced after the change.
7a. [Ubiquitous] The server shall define a *separate* LLM-output schema, used only as `completeStructured`'s `schema`. It contains only what the LLM may write (SPEC-05 AC-17): `architecture.prose`, `architecture.diagram`, `reasons: {path, reason}[]`, `comments: {index, comment}[]`, `rationales: {path, rationale}[]`, `first_tasks[]`. The server merges this into the deterministic lists (SPEC-05 AC-18/19), and the LLM never produces the DTO directly.

Persistence

8. [Ubiquitous] The server shall persist tours in a table that carries `workspace_id` (`server/AGENTS.md:24`), `repo_id`, `status`, `reason`, `index_sha`, the tour JSON, the usage columns of SPEC-05 AC-38, and `generated_at`, with at most one row per (workspace, repo). The planner chooses between extending the existing `onboarding` table (`db/schema/context.ts:120-126`; it has no rows written by any code today) through a generated migration, or adding a new table. In either case the migration is generated by `pnpm db:generate`, never hand-written.
9. [Ubiquitous] The server shall parse the persisted tour JSON with the tour DTO schema on read. A row that fails the parse shall be returned as `state: none` and logged, and never passed through unvalidated.

Generation job

10. [Ubiquitous] The server shall run generation as a `container.jobs` handler (new job kind, e.g. `onboarding-generate`), registered once from `onboarding/routes.ts` the way `repo-intel/routes.ts:31-32` registers its handlers. It shall pass the Fastify `app.log` into the handler as its pino sink.
11. [Ubiquitous] The in-flight check of SPEC-05 AC-41 shall be scoped by workspace and repo. Either a `generating` status on the tour row, set before enqueue, or a `jobs` row lookup (`db/schema/ops.ts:6-20`, `kind` + `payload.repoId` + status `queued|running`) satisfies it. The planner picks one.
12. [Ubiquitous] The handler shall wrap its whole body in try/catch and never rethrow, so that `JobRunner`'s `retries: 2` (`platform/jobs.ts:42`) cannot cause a second LLM call (SPEC-05 AC-33).
13. [Ubiquitous] The handler shall pass `timeoutMs: 30_000` and `maxRetries: 2` to `completeStructured`, so that three attempts fit under JobRunner's 120 s hard timeout (`jobs.ts:41`) with headroom for facts collection. The per-attempt transport `withRetry` inside the adapter (`adapters/llm/openai.ts:97`) is accepted as-is. Transport retries that error out return no usage, so they are not counted in `llm_calls`.

Facade and port additions

14. [Ubiquitous] The server shall add read-only facade methods to `RepoIntel` (`repo-intel/types.ts:137-172`) and implement them in `repo-intel/service.ts` + `repository.ts`, because the onboarding module may not read repo-intel tables itself. The methods are:
    - all endpoint facts for a repo (from `file_facts`);
    - `pagerank` per path for the top-N junk-filtered files (from `file_rank.pagerank`);
    - indexed-file counts per top-level directory.

    Each shall follow the facade's degraded contract: `[]` when `repoIntelEnabled` is false or there is no data (`types.ts:15-22`).
15. [Ubiquitous] The server shall add a bounded history method to the `GitClient` port (`vendor/shared/adapters.ts:205-239`) and to `SimpleGitClient`. It returns per-path commit counts for commits reachable from a given SHA within `sinceDays` and at most `maxCommits`. The method may deepen a shallow clone just enough, e.g. `git fetch --shallow-since=<date>` bounded by `--depth`. It shall never throw: it returns `null` when history can't be obtained (feeding SPEC-05 AC-14a). A mock implementation shall be added to `adapters/mocks.ts`.
16. [Ubiquitous] The server shall read manifests with `container.git.readFileAt(repo, index_sha, path)` (`adapters.ts:238`) and never from the working tree, so that facts match `index_sha` even if a resync moved the working tree.

Prompt

17. [Ubiquitous] The server shall rewrite `src/prompts/onboarding.system.md` to describe the five sections and the annotation-only output of S-7a. It shall keep the untrusted-data rule (`:11-12`), the mermaid rules (`:29-36`), the Markdown-only rule (`:38-40`) and the `{{language}}` rule (`:42-44`). The facts shall be sent in the user message as `wrapUntrusted(<label>, <text>)` blocks (via `platform/prompt.ts:6-11`), one block per component.

Observability

18. [Event-driven] WHEN the handler reaches a terminal state, the server shall call the injected pino logger exactly once, as `info` for `ready` and `warn` for `skeleton`, with message `onboarding.generation` and the fields of SPEC-05 AC-34.
19. [Ubiquitous] The server shall not log the prompt text, the README excerpt, or any secret. It shall log only counts, sizes, ids, SHAs, provider/model, usage and reason codes.

Testing hooks

20. [Ubiquitous] The server shall make every deterministic step (reading score, command builder, payload budgeter, annotation merge, comment sanitizer, script-name filter) a pure function in `helpers.ts`, testable without a DB, with the orchestration tested through `ContainerOverrides` (`platform/container.ts`) and the LLM mock (`adapters/mocks.ts:83-101`, which reports `costUsd: 0.001`).

## Edge cases

- The `repoIntel` facade getter and the routes-local service share a DB
  (`repo-intel/routes.ts:26-31`), so the new facade reads are served
  identically through `container.repoIntel`.
- `getCriticalPaths` returns `[]` when there are no edges
  (`service.ts:665-666`). The top-up from `getTopFilesByRank` (SPEC-05
  AC-15) covers this.
- `getTopFilesByRank` over-fetches `max(n×10, 100)` (`service.ts:647`). The
  reading-path candidate pool should draw from the same over-fetch before
  re-scoring by `reading_score`, because hotness can lift a file that is
  outside the top 8 by PageRank.
- `readFileAt` resolves `null` for a missing path (`adapters.ts:234-238`)
  and never touches the working tree. Callers still validate paths as
  repo-relative (the docstring at `:236`, "Callers validate `path` as a safe
  repo-relative path first").

### Cross-module dependencies

See SPEC-05. Server-specific points:

- a new job kind registered from `onboarding/routes.ts`;
- `repo-intel` facade additions (S-14);
- a `GitClient` port addition (S-15);
- a new or migrated table (S-8);
- a rewritten prompt template (S-17).

## Non-functional requirements

See SPEC-05. There is also a `pnpm arch` gate: the new module must pass
`no-cross-module-imports`.

## Inputs and provenance

As in SPEC-05. Route params reuse `IdParams` (`_shared/schemas.ts:11`), and
no request body is accepted.

## Untrusted inputs

As in SPEC-05. S-15's history reader takes only an internal SHA (validated
hex, like the existing check near `simple-git.ts:134`) and numeric bounds,
never browser input.

## Open questions

None specific to the server. The hotness / history-deepening, share-link
and discard-on-failure decisions were confirmed on 2026-09-29 (SPEC-05 OQ-1
to OQ-3, all closed).
