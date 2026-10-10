# Spec: Eval Pipeline — server refinement
Spec ID: SPEC-12
Status: draft
Supersedes: none

Refines `specs/L06-eval-pipeline.md` (SPEC-11) for `server/` and
`reviewer-core/`. SPEC-11 owns scope, the scoring definitions, the "frozen"
table and the decisions (Q1–Q14, N1–N5). This file adds
server detail and must not contradict it. Criteria here are numbered `A-n`;
"criterion n" without a prefix means SPEC-11.

Type names, column names and route paths other than the one the assignment
gives (`POST /agents/:id/eval-runs`) are `implementation-planner`'s contract
freeze, not decided here.

## Problem and user

**INSIGHTS entries that apply:** the `server/INSIGHTS.md` entries listed in
SPEC-11 all apply here. The ones that shape this file most:

- 2026-09-21, cross-module access through `container.<x>Repo` — A-3, A-4 and
  the two unresolved items under "Cross-module dependencies".
- 2026-09-22, Service ↔ `container.ts` `no-circular` — one hand-written
  baseline entry if an eval Service gets a container getter.
- 2026-09-21, `response:` serializer strips undeclared keys and rejects
  `Date` — A-30.
- 2026-09-21, body-less POST arrives as `null` — A-18.
- 2026-09-21, `drizzle-kit generate` needs a pty; 2026-09-21, `.it.test.ts`
  must use `seed()`; 2026-09-30, `tsc` does not see `server/test/**`;
  2026-09-21, grep `contracts/` before adding an export.
- 2026-09-18, "`pulls/routes.ts` had SQL inline in the route" — the new
  module starts with all three tiers.
- `reviewer-core/INSIGHTS.md`: none apply.

**Who hits this:** the client screens in SPEC-13, and `verify:l06`.

**What exists (verified):** tables `eval_cases` / `eval_runs`
(`src/db/schema/eval.ts:7-35`) with no reader or writer; no
`src/modules/eval/`; `src/modules/index.ts:30` names "eval/ci/hooks" as a
module a lesson adds. The engine entry point `reviewPullRequest`
(`../reviewer-core/src/review/run.ts:132`) returns everything a scored case
needs: `review.findings`, `dropped`, `costUsd` (`run.ts:101-122`).
`MockLLMProvider` (`src/adapters/mocks.ts:59`) and `ContainerOverrides` are
the test seam.

**What does not fit:** gaps G1–G13 in SPEC-11. Decided: one new migration
and additive changes to `src/vendor/shared/contracts/eval-ci.ts`, synced to
the client.

## Goals / Non-goals

**Goals:**

- A new feature module with `routes.ts` → `service.ts` → `repository.ts`,
  registered in `src/modules/index.ts`.
- Capabilities (paths are the planner's, except the one given):
  1. **draft** — pre-fill a case from a finding; read-only;
  2. **draft run** — execute an unsaved or edited case once; stores nothing;
  3. **save** — create a case from a finding plus the edited content;
  4. **update** — replace an existing case's name, diff and expectation
     location;
  5. read one case (for the edit modal), list an agent's cases with last
     result, delete a case;
  6. `POST /agents/:id/eval-runs`, read one run, list an agent's runs;
  7. compare two runs;
  8. the dashboard index (per-agent latest + recent runs).
- One shared case executor used by the draft run and the set run.
- A pure scoring function and its tests.
- Boot-time reaping of set runs left `running`.
- The `verify:l06` script.

**Non-goals:** everything in SPEC-11's out-of-scope table. In particular: no
case creation without a source finding, no client-supplied expectation type
or owner, no client-supplied PR metadata, no SSE stream, no cancel endpoint,
no `owner_kind = 'skill'` behavior, no storage of drafts or draft-run
results, no change to `agents.version` rules, no change to `reviewer-core`
behavior.

## User stories

1. As the client, I ask for a draft by finding id and get a complete,
   valid-to-run case back.
2. As the client, I send the draft's current content to be run once and get
   the outcome in the same response.
3. As the client, I save or update a case and get the stored case back.
4. As the client, I start a set run and poll it until it finishes.
5. As the client, I read history, one run, and a two-run comparison without
   computing any metric myself.

## Acceptance criteria (EARS)

### Placement and layering

- A-1. [Ubiquitous] The eval module shall keep HTTP and validation in
  `routes.ts`, orchestration in `service.ts` and every Drizzle query in
  `repository.ts`, and shall pass `pnpm arch` with no new unknown violation.
- A-2. [Ubiquitous] The eval repository shall scope every query by
  `workspace_id`, with one exception: the boot-time reaping of stale running
  eval runs (A-28e) runs across all workspaces, as the existing
  `reapStaleRunningRuns` does for review runs
  (`src/modules/reviews/repository/run.repo.ts:146-153`).
- A-2a. [Ubiquitous] The system shall hold run-level rows in whichever table
  the planner freezes, which may be a new table; where it is, the shipped
  `eval_runs` table and the legacy contracts `EvalRunRecord` and
  `EvalRunResult` shall be left in place and unwritten by this feature, and
  the shipped `EvalRun` export in `knowledge.ts` need not change — nullable
  metrics may be carried by new shapes in `eval-ci.ts`.
- A-3. [Ubiquitous] The eval module shall reach findings, agents and skills
  only through `container.reviewRepo`, `container.agentsRepo` and
  `container.skillsRepo`, and shall import no file from another module's
  folder.
- A-4. [Ubiquitous] The eval service shall resolve the LLM provider only
  through `container.llm(provider)`.

### Draft (criteria 2, 5–10)

- A-5. [Event-driven] WHEN a draft is requested, the system shall validate
  the finding id as a uuid through the route's `schema` option before the
  handler runs.
- A-6. [Event-driven] WHEN a draft is requested, the system shall load the
  pull request diff with the same loader a review run uses (`git diff
  base...head`, falling back to `pr_files` patches) and return, as the
  draft's diff, the file header plus only those hunks of the finding's file
  whose new-side lines intersect the finding's line range.
- A-6b. [Ubiquitous] The diff of every draft the system returns shall itself
  pass the same validation as a submitted diff (A-11): the header the system
  writes must be one the parser reads back as exactly one file with its
  hunks.
- A-6a. [Unwanted behavior] IF the finding's kind is `secret_leak`,
  `lethal_trifecta`, `phantom` or `hook` and its line range intersects no
  hunk of its file, THEN the system shall return, as the draft's diff, the
  file header and every hunk of that file, with a flag saying the expectation
  must be moved (criterion 8a).
- A-7. [Ubiquitous] The system shall return a draft whose diff and
  expectation pass the validation of A-11 and A-12 unchanged, except a draft
  returned under A-6a, whose expectation fails A-12 until the user moves it.
- A-8. [Ubiquitous] The system shall perform no insert, update or delete
  while producing a draft.
- A-9. [Event-driven] WHEN a draft is requested for a finding that already
  has a saved case for the same agent, the system shall return that case
  instead of a draft and say that it is an existing case.
- A-10. [Ubiquitous] The system shall answer each refusal in criteria 6, 7
  and 8 with its own stable error `code` in the standard
  `{error: {code, message, details}}` envelope.

### Validating submitted content (criteria 12–15)

- A-11. [Ubiquitous] The system shall validate every submitted diff by
  parsing it and requiring exactly one file with at least one hunk, on draft
  run, save and update alike.
- A-11a. [Unwanted behavior] IF a submitted diff contains more than one file
  — including two bare `---` / `+++` file blocks with no `diff --git` lines
  between them — THEN the system shall reject it under the one-file rule.
- A-11b. [Ubiquitous] The system shall answer an empty diff, an unparseable
  diff, a diff with no hunk, a diff with more than one file, and each
  malformed-expectation case of A-12 with its own stable error `code`, and
  shall put no schema-level minimum length or shape check on the diff or the
  expectation that would answer first with the generic validation error.
- A-12. [Ubiquitous] The system shall validate every submitted expectation,
  on draft run, save and update alike, by requiring: exactly one expectation;
  a file equal to the parsed diff's file path; integer start and end lines of
  at least 1 with start not greater than end; and a line range that
  intersects a hunk of the parsed diff under the rule `groundFindings` uses.
- A-13. [Ubiquitous] The system shall accept from the client, for a case,
  only: the source finding id or the case id, the name, the diff, and the
  expectation's file, start line and end line — never its severity, category
  or title, which are server-derived reference fields; plus, on save, the
  displayed expectation type, sent only so the server can detect a changed
  decision (A-20) and never used as an input to what is stored.
- A-14. [Unwanted behavior] IF a request carries an owner or pull request
  metadata, or an expectation type on any request other than the A-20
  comparison, THEN the system shall not use it.
- A-15. [Ubiquitous] The system shall derive, for a new case, the expectation
  type from the finding's `accepted_at` / `dismissed_at`, the owner from the
  finding's review, and the pull request metadata from the pull request row;
  and for an existing case, shall take all three from the stored case.

### Draft run (criteria 17–20)

- A-16. [Event-driven] WHEN a draft run is requested, the system shall
  identify the case by exactly one of a source finding id (new draft) or a
  case id (existing case), and reject a request with both or neither.
- A-17. [Event-driven] WHEN a draft run is requested, the system shall
  validate (A-11, A-12), derive (A-15), execute the case once through the
  shared case executor with the owning agent's current configuration, and
  answer in the same request with: the surviving findings, each with file,
  lines, severity, category, title and a matched flag; the pre-gate and
  post-gate counts; the pass or fail outcome; the duration; and the cost or
  null.
- A-17a. [Ubiquitous] The system shall write nothing to `eval_cases`,
  `eval_runs` or any other table during a draft run.
- A-17b. [Unwanted behavior] IF the case execution of a draft run throws,
  THEN the system shall answer with a distinct error carrying the reason.
- A-17c. [Unwanted behavior] IF a draft run exceeds the server-side time
  limit, THEN the system shall answer with a distinct timeout error.
- A-17d. [Ubiquitous] The system shall apply a per-route rate limit to the
  draft run no looser than the one on `POST /pulls/:id/review`.

### Save and update (criteria 25–28, 33)

- A-19. [Event-driven] WHEN a save arrives, the system shall validate (A-11,
  A-12, non-empty name), derive (A-15), and insert one case holding the
  submitted name, diff and expectation location plus every derived value.
- A-20. [Event-driven] WHEN a save arrives carrying the expectation type the
  modal displayed, the system shall compare it with the derived type only to
  decide whether to reject under criterion 27, and shall store the derived
  type.
- A-21. [Unwanted behavior] IF two saves for the same finding and agent
  race, THEN the system shall end with exactly one case and answer the loser
  with the conflict error of criterion 28.
- A-22. [Event-driven] WHEN an update arrives, the system shall validate
  (A-11, A-12, non-empty name), replace the name, diff and expectation
  location, record the edit time, and change nothing else on the case.
- A-23. [Ubiquitous] The system shall allow an update when the case's source
  finding no longer exists.

### Shared case executor (criterion 18)

- A-24. [Ubiquitous] The system shall provide one function that takes a
  case's content (diff text, pull request title and body, expectation) and an
  agent configuration (system prompt, provider, model, strategy, resolved
  skill bodies), and returns the surviving findings, the dropped count, the
  cost, the duration and the case outcome; the draft run and the set run
  shall both call it and neither shall call `reviewPullRequest` directly.
- A-25. [Event-driven] WHEN a case is executed, the system shall call
  `reviewPullRequest` exactly once with: the configuration's system prompt,
  model and strategy; the resolved skill bodies; the case's diff parsed into
  a `UnifiedDiff`; the case's pull request body as `prDescription` when
  non-empty; and no `callers`, `repoMap`, `intent`, `specs` or `memory`.
- A-26. [Ubiquitous] The system shall build the eval task line so that the
  pull request title, if present in the prompt at all, is wrapped as
  untrusted data, and shall include no other untrusted text in it.
- A-27. [Ubiquitous] The system shall take the pre-gate count as
  `review.findings.length + dropped.length` and the post-gate count as
  `review.findings.length` from the `ReviewOutcome` of that execution.

### Set run (criteria 38–50)

- A-18. [Event-driven] WHEN `POST /agents/:id/eval-runs` arrives with no
  body, the system shall accept it.
- A-28. [Event-driven] WHEN a set run is accepted, the system shall insert
  the run with status running and its snapshot before responding, and shall
  not await the execution of any case in the request.
- A-28a. [Ubiquitous] The system shall execute a set run's cases one after
  another, in a stable order recorded with the run, each through the shared
  case executor with the run snapshot as its configuration.
- A-28b. [Event-driven] WHEN a case of a set run finishes, the system shall
  update the run's persisted progress so a reader in another request sees
  it.
- A-28c. [Unwanted behavior] IF the executor throws for a case of a set run,
  THEN the system shall record that case as errored with the error message
  and shall not rethrow.
- A-28d. [Unwanted behavior] IF the one-running-run rule (criterion 44) is
  raced by two requests, THEN the system shall end with exactly one running
  run for that agent.
- A-28e. [Event-driven] WHEN the API starts, the system shall mark every set
  run still in status running as failed with a reason that names the
  restart.
- A-29. [Ubiquitous] The system shall apply a per-route rate limit to
  `POST /agents/:id/eval-runs` no looser than the one on
  `POST /pulls/:id/review`.

### Responses

- A-30. [Ubiquitous] The system shall declare a `response` schema on every
  eval route, map rows to DTOs before returning, and return timestamps as ISO
  strings.
- A-31. [Ubiquitous] The system shall parse stored case and run jsonb through
  a Zod schema when reading it back, and shall answer a malformed stored
  value with a validation error rather than passing it through.
- A-32. [Event-driven] WHEN two runs are compared, the system shall return
  both snapshots' system prompts, models and skill lists, both runs' metrics
  and cost, the case ids present in only one of the runs, and the ids of
  cases covered by both whose recorded edit times differ.
- A-33. [Unwanted behavior] IF a compare request names runs of different
  agents or a run that is not completed, THEN the system shall reject it with
  its own stable error `code`.
- A-33a. [Unwanted behavior] IF a compare request names a run that is unknown
  or outside the caller's workspace, THEN the system shall respond not-found
  (404), as A-34 does.
- A-34. [Unwanted behavior] IF a finding, agent, case or run id does not
  exist in the caller's workspace, THEN the system shall respond not-found.

### Scoring (criteria 51–60)

- A-35. [Ubiquitous] The scoring function shall take plain data — the
  expectations and, per case, the surviving findings, the pre-gate and
  post-gate counts and the errored flag — and return outcomes and metrics,
  with no parameter that can perform I/O.
- A-36. [Ubiquitous] The scoring module shall import nothing from
  `adapters/**`, `platform/container`, `db/**`, an LLM SDK, or any module
  that performs network or filesystem access.
- A-37. [Ubiquitous] The case outcome of a draft run and of a set-run case
  shall be computed by the same scoring function.

### `verify:l06` (criteria 73–74)

- A-38. [Ubiquitous] `server/package.json` shall define `verify:l06` as a
  vitest run over a fixed list of eval test files.
- A-39. [Ubiquitous] The `verify:l06` files shall include a hermetic scoring
  test with one assertion group per row of SPEC-11's edge-case table.
- A-40. [Ubiquitous] The `verify:l06` files shall include a test that runs
  scoring while a mock LLM provider counts calls and a stubbed `fetch`
  throws, and asserts zero calls.
- A-41. [Ubiquitous] The `verify:l06` files shall include a test that
  requests a draft for an accepted finding and for a dismissed finding
  through HTTP, asserts the types `must_find` and `must_not_flag`, asserts
  the draft diff holds only the intersecting hunk and passes A-11, and
  asserts the row counts of `eval_cases`, the shipped `eval_runs` table and
  any new run table are unchanged.
- A-41a. [Ubiquitous] The `verify:l06` files shall include a test that
  requests a draft for a full-file-kind finding whose line is off every hunk
  and asserts the draft holds every hunk of the file, carries the
  must-be-moved flag, and is rejected on draft run and on save until the
  expectation is moved into a hunk.
- A-42. [Ubiquitous] The `verify:l06` files shall include a test that
  performs a draft run through HTTP against `MockLLMProvider` and asserts one
  provider call, the returned outcome, and unchanged row counts in
  `eval_cases`, the shipped `eval_runs` table, any new run table, `reviews`,
  `findings`, `agent_runs` and `run_traces`.
- A-43. [Ubiquitous] The `verify:l06` files shall include a test that saves
  a case of each type through HTTP, including a save that sends a wrong
  expectation type and is not obeyed.
- A-44. [Ubiquitous] The `verify:l06` files shall include tests that a diff
  with two files, a diff with no hunk, an expectation on another file, an
  expectation with start after end, and an expectation off every hunk are
  each rejected on draft run and on save.
- A-45. [Ubiquitous] The `verify:l06` files shall include a test that runs a
  full set run through HTTP against `MockLLMProvider` and asserts exactly one
  provider call per case and no new row in `reviews`, `findings`,
  `agent_runs` or `run_traces`.
- A-46. [Ubiquitous] The `verify:l06` files shall include a test that draft
  runs a case, saves it unchanged, set-runs it with the mock LLM giving the
  same output, and asserts the two case outcomes are equal.
- A-47. [Ubiquitous] The `verify:l06` files shall include a test in which
  the same agent set-runs twice over the same cases, with the system prompt
  changed between runs and the mock LLM answering differently per prompt, and
  asserts different version labels and different recall or precision.
- A-48. [Ubiquitous] DB-backed eval tests shall be named `*.it.test.ts` and
  hermetic ones shall not.

## Edge cases

| Case | Resolution |
|---|---|
| `reviews.agent_id` is null or points at a deleted agent (`src/db/schema/reviews.ts:30`) | Criterion 7, A-10 |
| `git diff` fails or returns no files | `loadDiff` falls back to `pr_files` (`src/modules/reviews/diff-loader.ts:19-29`); if the file is still absent, criterion 8 |
| The file has no parsable hunk (binary, `pr_files.patch` null — `diff-loader.ts:37`) | Criterion 8, for every finding kind |
| A full-file-kind finding off every hunk of a file that has hunks | A-6a: not refused |
| A `finding`-kind finding off every hunk | Criterion 8: refused as outdated. It passed the gate when it was made, so the diff has moved |
| The finding's range spans two hunks | A-6 returns both |
| The hunk carries explicit `newLineNumbers` vs. only a declared range | Use the same index `groundFindings` builds (`../reviewer-core/src/grounding.ts:24-39`), so the draft and the gate agree |
| The client edits a hunk body without fixing the `@@` header counts | Whatever `parseUnifiedDiff` yields is what the gate and A-12 see. Open — A-Q4 |
| A draft run is requested, then the client disconnects | The LLM call still completes; nothing is stored (A-17a) |
| Concurrent draft runs for the same finding | Allowed; each is independent and stores nothing. Bounded by the rate limit only |
| The agent row changes while a set run is executing | The run uses its snapshot |
| A case is edited or deleted while a set run that covers it is executing | Open — the planner chooses between finishing with the already-loaded content and marking the case errored. Loading all case content once at run start satisfies criteria 36 and 67 most simply |
| A linked skill is deleted mid-run | Resolve bodies once at run start |
| Cost is `null` for a case (`ReviewOutcome.costUsd`, `run.ts:119`) | Criterion 50; draft run returns null |
| Server restarts mid set run | A-28e. A draft run in flight simply fails for its client |
| A stored `expected_output` is malformed | A-31 |
| Structured-output retries make more than one HTTP call to the provider | Allowed: the tests count `completeStructured` calls |
| `output_schema` on the agent (`src/db/schema/agents.ts:30`) | Not passed to `reviewPullRequest` today (`run-executor.ts:277-313`); not used here either |

### Cross-module dependencies

| Needs | From | Status |
|---|---|---|
| Finding + review + PR | `ReviewRepository.findingContext` (`src/modules/reviews/repository/review.repo.ts:106-120`) via `container.reviewRepo` (`src/platform/container.ts:107`) | Available. It does not filter by workspace; the caller compares `pull.workspaceId` (`reviews/findings.ts:17-20`) and the eval service must do the same |
| PR diff | `loadDiff` (`src/modules/reviews/diff-loader.ts:12`) | **Unresolved.** Inside `reviews`; a direct import violates `no-cross-module-imports` |
| Diff text → `UnifiedDiff` | `parseUnifiedDiff` (`src/adapters/git/diff-parser.ts:14`) | **Unresolved.** Adapter-layer function without a port; now on the hot path of draft run, save, update and set run |
| Agent row, linked skills | `container.agentsRepo` (`container.ts:103`) | Available |
| Skill bodies with trust wrapping | `resolveSkillBodies` (`src/platform/prompt.ts:35`) | Available |
| LLM | `container.llm` (`container.ts:196`) | Available |
| Engine + gate | `reviewPullRequest`, `groundFindings` from `@devdigest/reviewer-core` | Available; no change to reviewer-core |
| Boot reaping | `src/app.ts:82,96` | One more call next to `reapStaleRuns` |
| Module registry | `src/modules/index.ts` | One import, one entry |

The flow diagram is in SPEC-11.

## Non-functional requirements

- **Spend.** One `completeStructured` call per draft run and per set-run
  case. Tests must never reach a real provider.
- **Draft-run latency.** One LLM call inside a request. No request timeout is
  configured in `src/app.ts` today (none found), so the time limit of A-17c
  is new.
- **Request size.** The submitted diff is bounded by `bodyLimit: 1_048_576`
  (`src/app.ts:50`) and nothing else (SPEC-11 P2).
- **No effect on defaults.** `EMBEDDINGS_ENABLED` and repo-intel flags are
  not read or changed (`AGENTS.md:33-40`).
- **Migrations.** One, generated by `pnpm db:generate`; never hand-edited.
- **Indexes.** Owner lookup (workspace + agent → cases, → runs newest first)
  and the (source finding, owner) uniqueness behind A-21.

## Inputs and provenance

| Input | Source | Validated today |
|---|---|---|
| `:id` on `POST /agents/:id/eval-runs` | Path | Route does not exist. Reuse `IdParams` (`src/modules/_shared/schemas.ts:11`) in `schema.params`; `fastify-type-provider-zod` runs it before the handler, as on every route in `agents/routes.ts` |
| Body of the set-run request | Body, optional | none found. Body-less POST arrives as `null` (`reviews/routes.ts:45`) |
| Finding id (draft, draft run, save) | Path or body | none found for eval. Ownership check pattern: `reviews/findings.ts:17-20` |
| Case id (read, update, draft run, delete) | Path or body | none found |
| Name | Body | none found — A-19, A-22 |
| Diff text | Body | none found — A-11 |
| Expectation file / start / end | Body | none found — A-12 |
| Displayed expectation type (A-20) | Body | none found. Used only for the criterion-27 comparison, never stored |
| Run ids for compare | Path / query | none found |
| Workspace | `getContext` (`src/modules/_shared/context.ts:14`) | Resolved server-side |
| Expectation type, owner, PR metadata, display fields | Derived (A-15) | Not inputs |
| Stored case jsonb | Database | none found — `z.unknown()` (`src/vendor/shared/contracts/knowledge.ts:174-176`) |
| Model output | LLM | `Review` schema + `groundFindings` |

## Untrusted inputs

| Field | Boundary | Server-side validation today |
|---|---|---|
| Finding / agent / case / run ids | User → route | none found (no eval routes) |
| Submitted diff text | Browser → service → prompt, and → DB on save | none found for structure (A-11). Wrapped in the prompt by `wrapUntrusted('diff', …)` `../reviewer-core/src/prompt.ts:143`. Size: `src/app.ts:50` only |
| Submitted expectation file / lines | Browser → scoring → DB | none found (A-12) |
| Submitted name | Browser → DB → API response | none found (A-19) |
| Any submitted type / owner / PR metadata | Browser → service | none found; A-14 forbids using it |
| Frozen PR body | PR author → DB → prompt | `wrapUntrusted('pr-description', …)` `../reviewer-core/src/prompt.ts:127` |
| Frozen PR title | PR author → DB → task line | none found: `src/modules/reviews/helpers.ts:81-83` interpolates it unwrapped; A-26 |
| Finding title, severity, category copied into the draft and the case | Model output → response / DB | `Finding` shape only (`src/vendor/shared/contracts/findings.ts:47-67`); never sent to a prompt (criterion 41) |
| Stored case / run jsonb | DB → service | none found; A-31 |
| Model findings (draft run and set run) | LLM → scoring → response / DB | `../reviewer-core/src/review/run.ts:184-191`, `../reviewer-core/src/grounding.ts:52` |
| Provider error text returned by a failed draft run | Provider → response | none found; return as a plain string in `details`, never as markup |
| Linked skill bodies of source `imported_url` / `community` | External → DB → prompt | wrapped by `resolveSkillBodies` (`src/platform/prompt.ts:35-41`) |

## Open questions

No blocking question remains. N1–N5 are resolved in SPEC-11's Decisions
table: N1 (Save gate) is client-side only and adds no server criterion; N2
is A-17 / A-17c; N4 is A-11; N5 is A-6a.

Server-only, non-blocking:

- **A-Q1.** In-place reshape of `eval_cases` / `eval_runs` or a new run-level
  table: the planner's choice. An in-place reshape needs someone to confirm
  both tables are empty in the dev database first.
- **A-Q2.** Where the scoring function and the shared executor live:
  scoring in `reviewer-core` (pure) or the eval module's `helpers.ts`; the
  executor needs `container.llm`, so it stays in `server/`.
- **A-Q3 `[UX proposal]`.** A concurrency cap across draft runs and set runs
  that share one provider key.
- **A-Q4.** Whether the server should recompute `@@` header counts for an
  edited hunk or reject a hunk whose body disagrees with its header. Drafted:
  neither — the diff is taken as parsed. Confirm with a test of what
  `parseUnifiedDiff` does on a mismatched header before planning relies on
  it.
