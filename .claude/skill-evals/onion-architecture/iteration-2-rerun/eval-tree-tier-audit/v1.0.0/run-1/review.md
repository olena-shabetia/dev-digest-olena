The audit covers all 20 directories under `server/src/modules/` in `/home/olena/projects/dev-digest-olena`. Ten modules have at least one finding. The scratch `fixtures/tc4` copy isn't the repo, so I didn't use it.

`pnpm arch:report` reports 41 violations. All 41 match the entries in `server/.dependency-cruiser-known-violations.json`, so the CI gate passes, but every one is still a real violation. I've listed them below with file:line, plus a few the gate doesn't catch.

## Modules with findings

**settings** (no service, no repository)
- `routes.ts:3,5` imports `drizzle-orm` and `db/schema`.
- `routes.ts:25-28`, `55-61`, `63-66` run SQL against `container.db`.
- `routes.ts:54-62` loops over the body and upserts each key. That is business logic in a route.
- `feature-models.ts:1,8` imports `drizzle-orm` and `db/schema` in a service-tier helper.
- `feature-models.ts:41-44` queries `container.db` directly.

**polling** (route-only module)
- `routes.ts:4-5` imports `drizzle-orm` and `db/schema`.
- `routes.ts:28-31`, `38-56` (insert with upsert target), `66-69` (update) run SQL in the route.
- `routes.ts:34-37` calls GitHub and loops over PRs, which is orchestration in the route.

**workspace** (route-only module)
- `routes.ts:3-4` imports `drizzle-orm` and `db/schema`.
- `routes.ts:21-24` queries `container.db` in the route.

**pulls** (has a repository, but no service)
- `routes.ts:4,7` imports `drizzle-orm` and `db/schema`.
- Direct `container.db` queries at `routes.ts:33-36`, `55-74`, `91-94`, `111-118`, `169-176`, `186-188`, `198-200`, `210-220`, `228-232`, `270-275`.
- Business logic in the route: GitHub sync at `:41-54`, stats backfill loop at `:103-111`, `deriveReviewStatus` at `:147`, and the detail mapping at `:183-254`. The file is 331 lines.
- The repository exists (`pulls/repository.ts:63` `reviewAggregatesByPr`), but the route bypasses it for most queries.

**repo-intel** (service and pipeline import concrete adapters and do filesystem I/O)
- `service.ts:22` imports `adapters/codeindex/extract.js`.
- `service.ts:28` imports `adapters/astgrep/index.js`.
- `service.ts:29-30` imports `node:fs/promises` and `node:path`.
- `pipeline/full.ts:22-24` imports `node:fs/promises`, `node:os`, and `node:path`.
- `pipeline/full.ts:29-30` imports `adapters/astgrep` and `adapters/codeindex/extract`.
- `pipeline/incremental.ts:17-18` imports `node:fs/promises` and `node:path`.
- `pipeline/incremental.ts:22-23` imports `adapters/astgrep` and `adapters/codeindex/extract`.
- `pipeline/repo-map.ts:12` imports `adapters/tokenizer/index.js`. This is a type-only import, but the gate still flags it.

**reviews**
- `diff-loader.ts:3` imports the concrete `adapters/git/diff-parser.js`.
- `diff-loader.ts:4` imports `db/schema`, and `:17` uses `schema.repos.$inferSelect`.
- `run-executor.ts:6` imports `db/schema`, and `:60`, `:197`, and `:535` use `$inferSelect` types, so the run orchestrator depends on the DB row shape.
- `helpers.ts:6` imports `./repository.js`, which breaks the pure-helper rule. The gate flags it.
- `repository.ts:21` `export type ReviewRow = typeof t.reviews.$inferSelect`.
- `repository/review.repo.ts:7` has the same `$inferSelect` export.

**repos**
- `helpers.ts:2` imports `db/schema`, and `:44` uses `$inferSelect` in a helper. The gate flags it.
- `service.ts:14` imports `../repo-intel/constants.js`. This is the only cross-module import in the tree. The gate flags it.

**agents**
- `helpers.ts:3` imports `./repository.js`, and `repository.ts` imports back into `helpers.ts`. This is a circular dependency, and the gate flags it. The import is type-only, so it's a cycle with no runtime effect.

**conventions** (soft finding, not flagged by the gate)
- `sampler.ts:7-8` does filesystem I/O (`node:fs/promises`, `node:path`) from a helper module used by `service.ts:4`. This is I/O outside the service and repository tiers.

**Row-type exports** (not machine-detectable, found by grep)
- `conventions/repository.ts:17-18`, `intent/repository.ts:21`, `repos/repository.ts:10`, `skills/repository.ts:24-25` all export `$inferSelect` row types.

## Modules with no findings in this audit

`_shared`, `blast`, `brief`, `index.ts`, `intent`, `onboarding`, `pr-history`, `project-context`, `skills`, and `smart-diff`. The `_shared/context.ts:1-2` and `index.ts:1` Fastify and Container type imports are the carve-outs `enforcement.md` describes.

Agents, intent, onboarding, and skills still have route-level `container.` calls that may need a closer look for business logic, but I didn't audit that.

## Caveats

- The anti-patterns doc has stale line numbers. For example, it cites `settings/routes.ts:30,53,61` and `reviews/repository.ts:19`, but the code now has those at 25–66 and 21. Update the doc before the PR, or it will point reviewers at the wrong lines.
- I checked `workspace_id` scoping only by spot checks, not in every query. There are 74 `.from(t.…)` calls across the repositories.
- Nothing was changed. The working tree still has uncommitted edits to the onion-architecture skill, which I didn't touch.