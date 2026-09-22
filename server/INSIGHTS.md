# INSIGHTS — server

Append-only, newest entry first per section. See the `engineering-insights`
skill for the read/write/promotion contract.

---

## What Works

_None yet._

## What Doesn't Work

### 2026-09-22 — dependency-cruiser's `.dependency-cruiser-known-violations.json` baseline is pnpm-linker-specific

**Symptom:** `pnpm arch` passes clean locally (`0 dependency violations`) but
CI's `architecture` / `architecture (onion)` jobs fail on the exact same
commit, flagging 7 `no-sql-outside-repository` violations as new even though
`.dependency-cruiser-known-violations.json` already lists them.

**Cause:** `server/.npmrc:1` sets `node-linker=hoisted` — a flat `node_modules`
with no `.pnpm` virtual store, so `drizzle-orm` resolves to
`node_modules/drizzle-orm/index.d.ts`. CI's pinned `pnpm/action-setup@v4
version: 10` honors that setting. A locally-installed pnpm 12 did not honor it
and produced an isolated store instead, resolving the same import to
`node_modules/.pnpm/drizzle-orm@0.38.4_postgres@3.4.9/node_modules/drizzle-orm/index.d.ts`.
Regenerating the baseline (`pnpm run arch:baseline`) under that pnpm 12 install
baked in the isolated-store path, which never matches what CI's pnpm 10
actually resolves — dependency-cruiser's known-violations match is an exact
string compare on the resolved `to` path, so only the 7 violations that route
through `drizzle-orm` (the one dependency in this diff with an optional peer,
`postgres`, and therefore the only one whose resolved path differs between the
two store layouts) silently stopped matching.

**Fix:** regenerate the baseline from an install that actually honors
`node-linker=hoisted` — e.g. `CI=true npx --yes pnpm@10 install
--frozen-lockfile && npx --yes pnpm@10 exec depcruise src ../reviewer-core/src
--config .dependency-cruiser.cjs --output-type baseline >
.dependency-cruiser-known-violations.json` — then restore the normal local
install (`pnpm install --frozen-lockfile`) for day-to-day work; the committed
baseline doesn't need the local node_modules to match it.

**Rule:** never trust a clean local `pnpm arch` run as proof the baseline is
right if the local pnpm major version differs from CI's pinned one
(`.github/workflows/*.yml`'s `pnpm/action-setup@v4 version:`) — regenerate (or
at least verify) the baseline under a pnpm version that matches CI, not
whatever is installed locally.

### 2026-09-17 — `server/clones/` holds a full copy of this repository

**Symptom:** `grep`/`glob` across the repo return two hits for essentially every
source file, `README.md`, and skill file — one under the real path, one under
`server/clones/<owner>/<repo>/...`. Easy to end up reading or editing the wrong
copy.

**Cause:** `server/.env` sets `DEVDIGEST_CLONE_DIR=./clones`, which is relative
and therefore resolves inside the package. The app was then pointed at this very
repository, so it cloned itself (~6 MB). The directory is gitignored, so it never
shows up in `git status` as a reminder that it exists.

**Fix:** none needed for correctness — just never search or edit inside
`server/clones/**`. To relocate it, set `DEVDIGEST_CLONE_DIR` to an absolute path
outside the project (the code default is `~/.devdigest/workspace`).

**Rule:** scope searches away from `server/clones/`. Gitignored does not mean
invisible to tooling.

## Codebase Patterns

### 2026-09-21 — fixing a `no-cross-module-imports` violation by wrapping the call as a `Container` method can trip `no-circular` instead

**Symptom:** importing `settings/feature-models.ts`'s `getFeatureModelOverride`
directly from `conventions/service.ts` fails `pnpm arch`'s
`no-cross-module-imports` rule (the pattern below). The obvious fix — add a
`Container` method that wraps the call, so the caller only ever touches
`container.*` — instead fails a *different* rule, `no-circular`.

**Cause:** `settings/feature-models.ts` already does `import type { Container }
from '../../platform/container.js'` for its own function signatures. Because
`.dependency-cruiser.cjs` sets `tsPreCompilationDeps: true`, that type-only
import counts as a real edge — so `container.ts` → `feature-models.ts` →
(back to) `container.ts` is a genuine cycle from depcruise's point of view,
not a false positive.

**Fix:** `conventions/repository.ts:76-83` (`getConventionsModelOverride`)
reads the shared `settings` table directly via the schema barrel instead of
calling through `feature-models.ts` at all — the same pattern already used
for reading `repo_index_state` cross-module (`getLastIndexedSha`). No
`Container` method was added; `platform/container.ts:109-110`'s new
`skillsRepo` getter (added the same session, for a *different*, acyclic
target) shows the normal case still works fine.

**Rule:** before "fixing" a `no-cross-module-imports` violation by adding a
wrapper method on `Container`, check whether the target file already imports
`Container`'s type anywhere — if it does, the wrapper will trip
`no-circular` instead, and reading the underlying shared table directly
(schema barrel) is the escape hatch, not a second wrapper layer.

### 2026-09-21 — cross-module data access must go through `container.<x>Repo`, never a direct sibling-module import

**Symptom:** `pnpm arch` fails with a `no-cross-module-imports` violation when
one module's `service.ts`/`repository.ts` imports a function directly from
`../<other-module>/repository.ts`. Hit twice independently while building L02
(skills reading `agents/repository.ts`'s `linkedSkills`; `agents` reading
`reviews/repository/run.repo.ts`'s `listRunsForAgent`).

**Cause:** `src/modules/<a>/` importing from `src/modules/<b>/` is a hard
dependency-cruiser rule (`.dependency-cruiser.cjs`) — modules may only reach
each other through the DI container.

**Fix:** route through the container's lazy repo getters instead
(`container.agentsRepo`, `container.reviewRepo` in `platform/container.ts`) —
add a thin wrapper method on the target module's repository class if one
doesn't exist yet. For a genuinely cross-cutting helper (not tied to one
module's tables), put it in `platform/` instead — e.g. `resolveSkillBodies`
(the skills untrusted-wrapping rule) lives in `platform/prompt.ts` because both
`reviews/run-executor.ts` and `skills/helpers.ts` need it.

**Rule:** before importing a data-access function across
`src/modules/<a>/` → `src/modules/<b>/`, check whether it's already exposed via
a `container.<x>Repo` getter and extend that — don't reach into a sibling
module's folder directly, even when a plan/spec explicitly suggests the direct
import path.

### 2026-09-21 — run events (SSE stream) are never persisted — no `run_events` table exists

**Symptom:** a whole-repo DB-index audit (`plans/sparkling-wiggling-allen.md`,
Wave 3) assumed a `run_events` table needing an index on `(run_id, seq)` for
the SSE stream — there is no such table anywhere in `db/schema/*.ts`.

**Cause:** a run's live log/events are held entirely in memory via `RunBus`
(publish/subscribe keyed by `runId`, `platform/` — see `reviews/routes.ts`'s
`GET /runs/:id/events`, which replays from that in-memory buffer, not a DB
read). Only the FINISHED run's single-document trace (`run_traces.trace`,
one row per run) and the `agent_runs` row itself are persisted — nothing
SSE-shaped is.

**Fix:** none needed — this was a false assumption in the audit, not a gap in
the schema. The Wave 3 index work skipped this row rather than fabricating an
index for a table that doesn't exist.

**Rule:** before indexing (or otherwise assuming the existence of) a table
named for a runtime concept like "events" or "stream", check
`db/schema/*.ts` first — some of this repo's real-time surfaces (SSE runs)
are intentionally in-memory-only and were never meant to be persisted.

### 2026-09-21 — `vendor/shared/index.ts`'s barrel silently drops a duplicate `export *` symbol

**Symptom:** `contracts/productionize.ts:189` re-exports `Severity`, which
already exists in `contracts/findings.ts` (re-exported by the same barrel).
No build error, no lint warning, no runtime error — `Severity` just resolves
to whichever of the two `export *` statements the barrel processes for that
name (TypeScript's own rule for colliding wildcard re-exports), and the other
copy is invisible from `@devdigest/shared`.

**Cause:** `vendor/shared/index.ts` is 10 flat `export *` statements over
`contracts/*.ts`, added independently per lesson/feature; nothing enforces
that a symbol name is declared in exactly one of those files.

**Fix:** none needed today — both copies of `Severity` are identical, so the
collision is currently harmless.

**Rule:** before adding a new export to any file under `contracts/`, grep the
whole `contracts/` directory for that identifier first. If a future rename
touches only one of two colliding copies, the other could silently vanish
from `@devdigest/shared` with no error anywhere — this would surface as a
missing-export TS error only at the IMPORT site, not at the barrel.

### 2026-09-18 — `pulls/routes.ts` had aggregate SQL business logic inline in the route handler

**Symptom:** the PR-list route (`GET /repos/:id/pulls`,
`server/src/modules/pulls/routes.ts:31`) built a latest-review score lookup —
a full `SELECT` + `orderBy` + JS grouping — directly inside the Fastify
handler (was around `routes.ts:133-149` pre-fix), with no `repository.ts` in
that module at all.

**Cause:** the `pulls` module was never split into the
`routes → service → repository` layering `server/AGENTS.md` mandates
elsewhere ("routes.ts = HTTP + Zod validation, zero business logic"); it grew
as routes.ts-only and nobody extracted the query when it was added.

**Fix:** when L01 (run cost badge) needed a second aggregate (`SUM` of
`agent_runs.cost_usd` per PR) alongside the existing score lookup, both moved
into `server/src/modules/pulls/repository.ts:19` (`reviewAggregatesByPr`),
called from `routes.ts:138`, rather than adding a second inline query next to
the first.

**Rule:** before adding a new query to a route handler, check whether the
route already has an inline query it never should have had — extracting both
at once is cheaper than compounding the violation. This module in particular
may still have others; sweep it before adding to it.

### 2026-09-17 — reviewing a PR uses OpenRouter, not OpenAI/Anthropic, by default

**Symptom:** you set `OPENAI_API_KEY` or `ANTHROPIC_API_KEY`, run a review on a
seeded agent, and it still fails to resolve an LLM provider.

**Cause:** `server/src/db/seed.ts` creates the built-in agents (General,
Security, Performance) on `provider: 'openrouter'`, `model:
'deepseek/deepseek-v4-flash'`. The container resolves the provider named on the
agent row, not whichever key happens to be set.

**Fix:** set `OPENROUTER_API_KEY`, or edit the agent's provider/model in the
Agent editor to `openai`/`anthropic` before running a review.

**Rule:** don't assume a configured OpenAI/Anthropic key is enough — check which
provider the target agent is actually set to.

## Tool & Library Notes

### 2026-09-21 — `fastify-type-provider-zod`'s response serializer runs `safeParse` BEFORE `JSON.stringify`, not after

**Symptom:** attaching a `response:` schema to a route can (a) silently drop
a field the handler actually returned, or (b) turn a previously-working
route into a 500, for a value that serialized fine before the schema existed.

**Cause:** the compiled serializer
(`fastify-type-provider-zod/dist/src/core.js`) is
`JSON.stringify(schema.safeParse(data).data)` — the schema runs against the
in-memory JS object, not its JSON form. Two consequences fall out of that:
Zod 3's default `z.object` strips any key the schema doesn't declare (so an
omitted/undeclared field vanishes with no error, no log); and a `z.string()`
field rejects a raw `Date` even though Fastify's own default `JSON.stringify`
would have called `Date#toJSON()` on it just fine — the schema sees the
`Date` object, not the string it would eventually become.

**Fix:** hit both in practice on `repo-intel`: `IndexState.updatedAt` was a
`Date` handed straight to the route (no DTO mapper, unlike every other
module); adding `RepoIndexState` (`z.string()`) as its `response:` schema
would have turned every call into a 500. Fixed by mapping to ISO explicitly
in a new `repo-intel/helpers.ts` (`toIndexStateDto`) BEFORE the schema was
ever attached — see `plans/moonlit-drifting-pnueli.md`, Wave 1.2 step B.

**Rule:** before attaching a `response:` schema to an existing route, check
every field the handler currently returns against the schema's declared
keys AND types — an omitted key or a `Date`/other non-JSON-primitive field
is a silent field-drop or a new 500, not a validation error you'd notice in
a quick smoke test. Proving the gate actually catches both (a stripped field
failing an existing test; a `Date` producing the structured 500 via
`isResponseSerializationError`) is worth doing once per module, not just
trusting the types.

### 2026-09-21 — Fastify's `app.inject()` (and a real empty POST) delivers a body-less request as `null`, not `undefined`

**Symptom:** `RunRequest.default({})` on a `schema.body` still rejects a
POST with no payload and no `Content-Type` — 422 `"Expected object, received
null"` — even though every field on `RunRequest` is `.optional()`.

**Cause:** Zod's `.default()` only substitutes its default value when the
input is exactly `undefined`; a body-less request (verified via
`light-my-request`'s `app.inject()` with no `payload`, and expected to match
real HTTP behavior) arrives as `null`, which `.default()` does not intercept
— the wrapped object schema then rejects `null` on its own terms.

**Fix:** `z.preprocess((v) => v ?? {}, RunRequest)` instead of
`RunRequest.default({})` — `??` catches both `null` and `undefined` before
`RunRequest` ever sees the value. Applied on `POST /pulls/:id/review`
(`reviews/routes.ts`) when moving its manual `RunRequest.parse(req.body ??
{})` onto `schema.body` (Wave 1.3).

**Rule:** `.default()` on a Zod schema handles a MISSING key or an omitted
property inside an object; it does NOT handle an explicit `null` at the top
level of `schema.body`. Any route accepting a genuinely optional body needs
`z.preprocess` (or `.nullable().transform(...)`), not `.default()` alone —
verify with an actual `app.inject()` call with no `payload`, not just a
`safeParse(undefined)` in isolation.

### 2026-09-21 — dependency-cruiser `path` matchers match the RESOLVED path, not the import specifier

A rule's `path`/`pathNot` is tested against the resolved file dependency-cruiser
found for an edge, not the string in the `import` line. For an npm package that
resolved path looks like `node_modules/.pnpm/drizzle-orm@0.38.4_postgres@3.4.9/node_modules/drizzle-orm/index.d.ts`
(pnpm's nested layout), or for some packages (observed for `octokit`) the bare
specifier with no path prefix at all. A pattern written as `^drizzle-orm` or
`^zod$` matches neither shape and silently never fires — the rule reports a
clean pass while enforcing nothing.

**Fix:** `server/.dependency-cruiser.cjs`'s `pkg(name)` helper builds all the
patterns a package name needs (both the pnpm-nested and bare-specifier forms).
Any new rule targeting an npm dependency should call `pkg()` rather than
hand-write a `^pkgname$`-style pattern.

**Rule:** when a dependency-cruiser rule targeting a third-party package
reports zero violations, verify with `--output-type json` and inspect
`dep.resolved` before trusting the "clean" result — it may be a silent
non-match, not an actual absence of violations.

### 2026-09-21 — dependency-cruiser `exclude` deletes the edge before any rule runs; use `doNotFollow` for npm packages

`exclude.path` and `doNotFollow.path` look interchangeable but are not:
`exclude` removes the matched edge from the dependency graph entirely, before
any `forbidden` rule ever sees it, while `doNotFollow` keeps the edge visible
for rule matching but stops crawling past it into the package's own internals.
Putting `node_modules` in `exclude` (as `server/.dependency-cruiser.cjs` did
initially) silently reduced a real 22-violation `no-sql-outside-repository`
result to 15 — every bare `drizzle-orm`/`postgres` package import vanished,
leaving only the `src/db/**`-path matches — and made rules like `ports-purity`
and `vendor-sdk-only-in-adapters` never fire on any legitimate `zod`/`octokit`
import either, since their allowlists also target node_modules paths.

**Fix:** keep `node_modules` out of `options.exclude` and put it only in
`options.doNotFollow` (`server/.dependency-cruiser.cjs`).

**Rule:** if a dependency-cruiser config needs any rule to match an edge
*into* node_modules (SDK containment, persistence containment, port purity),
`node_modules` must not appear in `exclude` — only in `doNotFollow`.

## Recurring Errors & Fixes

### 2026-09-21 — `drizzle-kit generate`'s interactive rename-vs-create prompt can't be answered by piping input into a non-tty stdin

**Symptom:** running `pnpm db:generate` after adding new columns to the
`conventions` table hangs (or silently misfires) when its output is piped or
its stdin is fed via a normal `echo "\n" | ...` redirect — the "is this a
rename or a new column?" prompt never receives the answer.

**Cause:** drizzle-kit's schema-diff prompt reads keystrokes in raw mode; a
piped `\n`/`\r` byte stream isn't a real keypress event to a raw-mode reader,
so redirecting stdin doesn't work no matter what bytes are sent.

**Fix:** drive it through a real pty instead — e.g. Python's
`pty.openpty()`, writing `\r` for each prompt — then run `pnpm db:migrate`
normally once the migration file is generated. Produced
`server/src/db/migrations/0013_nappy_tattoo.sql` (all new columns, no
renames, so every prompt answer was "create column").

**Rule:** don't try to answer a `drizzle-kit generate` interactive prompt by
piping `\n`/`\r` into stdin — it needs a pty. Reach for one immediately
rather than debugging why a redirect "isn't working."

### 2026-09-21 — an `.it.test.ts` that hand-inserts a workspace row fails every request with "No default workspace found"

**Symptom:** a DB-backed integration test inserts its own `t.workspaces` row
(instead of calling `seed()`) with an arbitrary name, then every
`app.inject()` call in that test fails with "No default workspace found."

**Cause:** `LocalNoAuthProvider.currentWorkspace()` (`adapters/auth/local.ts`)
resolves the workspace by an exact name match on `DEFAULT_WORKSPACE_NAME`, not
"the first workspace row" — an arbitrarily-named row is invisible to it. (This
is a different failure mode than the caching issue below — that one is about a
*stale* cache after reset, this one is about a workspace that's never found in
the first place.)

**Fix:** any new `.it.test.ts` that needs a workspace should call `seed()`, or
if inserting one by hand, name it exactly `DEFAULT_WORKSPACE_NAME` (exported
from `db/seed.ts`).

**Rule:** don't hand-roll a workspace fixture with an arbitrary name in a new
integration test — use `seed()` or the exact default name.

### 2026-09-18 — `LocalNoAuthProvider` caches workspace/user, so a DB reset needs a process restart

**Symptom:** after `TRUNCATE`-ing demo tables and re-running `pnpm db:seed`
against a live dev DB, `GET /repos` returns `[]` even though the seed script
logged success and the rows exist in Postgres.

**Cause:** `adapters/auth/local.ts`'s `LocalNoAuthProvider` memoizes
`currentWorkspace()`/`currentUser()` on first call (`cachedWorkspace`,
`cachedUser`), so a long-running API process keeps serving the pre-truncate
workspace id, which no longer matches any row after the reseed creates a new
one.

**Fix:** restart the API process (`pnpm dev` / `tsx watch src/server.ts`)
after any manual DB reset — a fresh process re-resolves the cache from the
live default-workspace row on its next request.

**Rule:** never diagnose "the reseed didn't take effect" by re-checking the
DB alone — check whether the API process predates the reset first.

### 2026-09-18 — seed's `reviews.run_id` was never linked to its `agent_runs` row

**Symptom:** a feature that joins a persisted review to the run that produced
it (via `reviews.run_id → agent_runs.id`) works against real data but finds
nothing against the seed.

**Cause:** `server/src/db/seed.ts` inserts the sample review for PR #482
before inserting the demo `agent_runs`, and never sets `reviews.run_id`
afterward — the column exists precisely to link them, but the seed left it
`null`.

**Fix:** capture the `agent_runs.insert(...).returning()` result and
`UPDATE reviews SET run_id = <security run id>` right after, so the seeded
review is linked the same way a real run-then-persist-review flow would leave
it.

**Rule:** when a feature depends on a FK the seed leaves null, fix the seed
alongside the feature — don't assume seed data exercises every join real data
does.

### 2026-09-17 — a stored secret silently overrides `.env`

**Symptom:** you change a key in `server/.env`, restart, and the review still
uses the old value.

**Cause:** `LocalSecretsProvider` (`adapters/secrets/local.ts`) reads
`~/.devdigest/secrets.json` first and falls back to `process.env` only when a
key is absent there. Any key ever entered via the Settings UI is written to that
file and wins from then on, regardless of `.env`.

**Fix:** check `~/.devdigest/secrets.json` before debugging an env value that
"isn't taking" — either edit the value there or remove the key so `.env` is used
again.

**Rule:** when a review uses a key you didn't expect, the stored-secrets file is
the first thing to check, not `.env`.

### 2026-09-17 — `relation ... does not exist` on a fresh database

**Symptom:** the API boots fine but the first request against a real table
fails with Postgres error `relation "..." does not exist`.

**Cause:** the server deliberately does not run migrations on boot (see
`AGENTS.md`), so a freshly created database has no schema until migrations are
applied explicitly.

**Fix:** `cd server && pnpm db:migrate`.

**Rule:** this is the first thing to check on any "works locally, broken on a
fresh clone/DB" report — before suspecting the code.

## Session Notes

_None yet._

## Open Questions

_None yet._
