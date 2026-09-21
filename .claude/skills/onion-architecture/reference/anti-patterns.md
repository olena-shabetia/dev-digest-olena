# Anti-patterns — real drift in this tree

Every entry below is verified against the current codebase, not hypothetical.
All are frozen in `server/.dependency-cruiser-known-violations.json` so they
don't block CI — freezing is not endorsement. Don't copy any of these; fix the
module you're touching if you're already in it (see
`server/INSIGHTS.md` 2026-09-18: "sweep it before adding to it").

## Routes doing SQL directly (module has no service/repository tier)

❌ `modules/settings/routes.ts:3,10` — imports `drizzle-orm` + `db/schema`,
queries `container.db` at lines **30, 53, 61**. No `service.ts`, no
`repository.ts` anywhere in the module.

❌ `modules/polling/routes.ts:3,4` — queries at **22, 32, 60**. `routes.ts` is
the module's only file.

❌ `modules/pulls/routes.ts:3,6` — queries at **29, 48, 81**. No `service.ts`
(this is the largest routes file in the codebase at 314 lines — a route
without a service tier keeps absorbing logic).

❌ `modules/workspace/routes.ts:2,3` — query at **18**. `routes.ts` is the
only file in the module.

**Why it breaks the ring:** `routes.ts` is HTTP + Zod validation only
(`server/AGENTS.md`). A query here means the module collapsed all three tiers
into one, and there is no repository to enforce `workspace_id` scoping as a
single reviewable chokepoint.

**Fix:** extract a `repository.ts` (query fns) and a `service.ts`
(orchestration) the way `modules/reviews/` does it, before adding anything
else to these files.

## Service tier reaching past its repository

❌ `modules/settings/feature-models.ts:1,8,41` — a service-tier helper
importing `eq` from `drizzle-orm`, `* as t` from `db/schema`, and querying
`container.db` directly at line 41. No repository exists in `settings/` to
delegate to.

❌ `modules/reviews/run-executor.ts:5` — `import * as schema from
'../../db/schema.js'` in the run orchestrator, despite already holding a
`ReviewRepository` instance (`:7`) it could delegate through.

**Why it breaks the ring:** once a service can see `db/schema` directly, the
repository stops being the single place SQL lives, and `workspace_id` scoping
can no longer be verified in one file.

**Fix:** add the missing query method to the module's repository (or the
relevant `repository/*.repo.ts`) and call that from the service instead.

## Service importing concrete adapters instead of ports

❌ `modules/repo-intel/service.ts:22,28` — imports
`adapters/codeindex/extract.js` and `adapters/astgrep/index.js` by concrete
path. Neither has a port interface in `vendor/shared/adapters.ts`, so neither
can be swapped via `ContainerOverrides` — a test exercising this service is
stuck with the real `@ast-grep/napi` binary. The same file also imports raw
`node:fs/promises` and `node:path` at **:29-30** — filesystem I/O in the
service tier.

**Why it breaks the ring:** the whole point of resolving adapters through
`container.<x>` is that services stay testable without the real SDK. A direct
import defeats that even when the underlying capability is otherwise
well-factored.

**Fix (not applied by this skill — tracked as a gap):** give `astgrep` and
`codeindex/extract` port interfaces the way `CodeIndex`/`RipgrepCodeIndex`
already work, and resolve them through the container.

## Platform / adapters touching the DB directly

❌ `platform/jobs.ts:3,4` — `import type { Db }` + `import * as t from '../db/schema.js'`.
The job runner updates run state directly against the schema rather than
through a module repository.

❌ `adapters/auth/local.ts:3,4,5` — `LocalNoAuthProvider` imports `Db`,
`db/schema`, and (unusually) `DEFAULT_WORKSPACE_NAME`/`SYSTEM_USER_EMAIL` from
`db/seed.js` — constants meant for seeding, pulled into a runtime adapter.

**Why it's flagged, not exempted:** `platform/**` and `adapters/**` are
allowed to be closer to infrastructure than a module's `service.ts`, so this
is a softer case than routes-doing-SQL. But `db/seed.ts` is meant to
initialize a fresh database, not to be a source of runtime constants for an
adapter — that coupling means a change to seed data can silently change auth
behavior.

**Fix (not applied by this skill):** move `DEFAULT_WORKSPACE_NAME`/
`SYSTEM_USER_EMAIL` to a shared constants location both `db/seed.ts` and
`adapters/auth/local.ts` import from, rather than one importing the other.

## More concrete-adapter imports beyond repo-intel/service.ts

❌ `modules/reviews/diff-loader.ts:3` — imports
`adapters/git/diff-parser.js` directly; no port for diff parsing exists.

❌ `modules/repo-intel/pipeline/repo-map.ts` — imports
`adapters/tokenizer/index.js` directly, bypassing `container.tokenizer`.

Same class of issue as `repo-intel/service.ts:22,28` above — repeated in this
own module's pipeline files (`incremental.ts`, `full.ts`) too.

## Cross-module import

❌ `modules/repos/service.ts:14` — `import { … } from '../repo-intel/constants.js'`.

**Why it breaks the ring:** feature modules are meant to be siblings, not a
hierarchy. A direct reach into another module's folder creates a dependency
that isn't visible at the composition root.

**Fix:** if the constant is genuinely cross-cutting, promote it to
`vendor/shared` or `platform/`; if it's repo-intel-specific, expose it through
`RepoIntelService`'s public surface instead of importing the file directly.

## DB row type as the domain model

❌ `modules/reviews/repository.ts:19` — `export type ReviewRow = typeof
t.reviews.$inferSelect` (also `:34`, `:38` for repos). Services and
`run-executor.ts` then consume the raw DB row shape, not a domain entity.

**Why it breaks the ring:** persistence details (column names, nullability
inferred from the schema) leak inward as the de-facto public type of the
domain. The `helpers.ts` `*Dto` converters mitigate this at the outbound HTTP
edge, but nothing stops the row type itself from propagating through
services.

**Not machine-detectable** — `dependency-cruiser` sees module-to-module edges,
not type expressions, so this can't be caught by `pnpm arch`. Treat it as a
code-review checklist item: does an exported type from a `repository.ts`
originate in `$inferSelect`? If so, is it ever consumed outside that module's
own service?

## Deliberate exception — do not "fix" this one

✅ `platform/container.ts:26-29` imports `modules/agents/repository.js`,
`modules/reviews/repository.js`, `modules/repo-intel/{types,service}.js`,
creating a `platform → modules → platform` cycle.

This is intentional. The comment at `container.ts:70-72` explains the trade:
these are constructed in the composition root so consuming modules use
`container.agentsRepo` instead of reaching into another module's folder
directly — i.e. this cycle exists *to prevent* the cross-module import
violation above from being more widespread. `pnpm arch`'s `no-circular` rule
has this frozen in the baseline; don't attempt to "clean" it by moving these
constructions elsewhere without re-reading `docs/architecture.md` first.
