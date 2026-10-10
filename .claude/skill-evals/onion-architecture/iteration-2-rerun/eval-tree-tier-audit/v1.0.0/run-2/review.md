## Onion-layer audit of `server/src/modules/`

I ran `depcruise` with the repo's `.dependency-cruiser.cjs` over `server/src` and checked the tier layout by hand. The cruiser reports 41 violations, 33 of them in modules. The other 8 are outside modules: `platform/jobs.ts` (drizzle edge) and `adapters/auth/local.ts` (db/schema, db/seed, drizzle edges). The baseline (`--ignore-known`) hides 34 of the 41, leaving 7 unbaselined findings, which I've marked **NEW**. I did not run `pnpm arch` itself.

The skill's `anti-patterns.md` line numbers are stale. For example, `pulls/routes.ts` queries are now at :33–:275, not 29/48/81. Use the numbers below.

### Modules that break the rules

**1. `settings`** (no service, no repository) **NEW**
- `routes.ts:3,5` imports `drizzle-orm` and `db/schema`. Queries at `:25–28`, `:55–56`, `:63–66`. HTTP and SQL are mixed in one file.
- `feature-models.ts:1,8` imports `drizzle-orm` and `db/schema`. Query at `:41–44`. This is a service-tier helper running SQL directly.

**2. `polling`** (routes only) **NEW**
- `routes.ts:4,5` imports `drizzle-orm` and `db/schema`. Queries at `:28–31` (select), `:38–39` (insert), `:66–69` (update).

**3. `pulls`** (no service.ts; routes run SQL)
- `routes.ts:4,7` imports `drizzle-orm` and `db/schema`. **NEW** on the unbaselined drizzle edge.
- Queries in `routes.ts` at `:33–36`, `:55–56`, `:91–94`, `:111–118`, `:169–176`, `:186–200`, `:210`, `:228–229`, `:270–275`.
- `routes.ts:12` imports `reviewAggregatesByPr` from `repository.ts`, and `:131` calls it with `container.db`. So a repository exists but the route bypasses it for most queries.

**4. `workspace`** (routes only) **NEW**
- `routes.ts:3,4` imports `drizzle-orm` and `db/schema`. Query at `:21–24`.

**5. `reviews`** (the largest number of findings)
- `service.ts:10` type-imports `db/rows.js`. Flagged by `no-sql-outside-repository`. Type-only, but the rule matches it. Baselined.
- `run-executor.ts:6` does `import * as schema from '../../db/schema.js'` and uses it at `:60`, `:197`, `:535`. Flagged, and it is the run orchestrator even though it already holds a `ReviewRepository`. Baselined.
- `run-executor.ts` also imports `db/rows.js` (flagged, baselined).
- `diff-loader.ts:3` imports `adapters/git/diff-parser.js` directly. `modules-no-concrete-adapters`, baselined.
- `diff-loader.ts:4` imports `db/schema.js`. `no-sql-outside-repository`, baselined.
- `helpers.ts:6` type-imports `./repository.js`. `helpers-and-constants-are-pure`, baselined. Helpers must not touch repositories.

**6. `repos`**
- `helpers.ts:2` imports `db/schema.js`. Used at `:44` (`typeof t.repos.$inferSelect` in `toRepoDto`). `helpers-and-constants-are-pure` and `no-sql-outside-repository`, baselined.
- `service.ts:11–14` imports `../repo-intel/constants.js`. `no-cross-module-imports`, baselined. Cross-module reach.

**7. `repo-intel`** (most concrete-adapter and cycle findings)
- `service.ts:22` imports `adapters/codeindex/extract.js`. `service.ts:28` imports `adapters/astgrep/index.js`. `modules-no-concrete-adapters`, baselined.
- `service.ts:29–30` imports `node:fs/promises` and `node:path`. Filesystem I/O in the service tier. Not a cruiser rule, but a layer violation.
- `service.ts:21` type-imports `platform/container.js`, creating a cycle through `container.ts`. Baselined. This cycle is documented as deliberate.
- `pipeline/full.ts:29–30` imports `adapters/astgrep` and `adapters/codeindex`. Baselined.
- `pipeline/full.ts:27` imports `platform/container.js`, creating a cycle. Baselined.
- `pipeline/incremental.ts:22–23` imports `adapters/astgrep` and `adapters/codeindex`. Baselined.
- `pipeline/incremental.ts:20` imports `platform/container.js`. Cycle through `full.ts`. Baselined.
- `pipeline/repo-map.ts:12` imports `adapters/tokenizer/index.js` directly. Baselined.

**8. `agents`**
- `helpers.ts:3` type-imports `./repository.js`. `helpers-and-constants-are-pure`, baselined.
- `repository.ts:6` imports `isConfigChange` from `./helpers.js`. Together with `helpers.ts:3`, this forms a cycle. Baselined. The fix is to move `isConfigChange` out of the helper or make the types live in a separate file.

**9. `intent`**
- `service.ts:1` type-imports `platform/container.js`. Cycle with `container.ts:30`, which imports `IntentService`. Baselined. Note this is a cycle not covered by the documented "deliberate" exception.

### Modules that are clean on the rules

- `brief`, `conventions`, `onboarding`, `skills`: full three-tier layout; no violations found.
- `blast`, `pr-history`, `project-context`, `smart-diff`: no repository tier, but no SQL or adapter imports either. Not a rule violation. Adding SQL here would need a `repository.ts` first.
- `_shared`: no violations.

### Before you open the PR

- The 7 **NEW** findings (`settings/routes.ts:3`, `settings/feature-models.ts:1`, `pulls/routes.ts:4`, `polling/routes.ts:4`, `workspace/routes.ts:3`, plus `platform/jobs.ts` and `adapters/auth/local.ts`) fail the baseline. This is because the drizzle edge now resolves to `node_modules/.pnpm/drizzle-orm@0.38.4_postgres@3.4.9/...`, which the known-violations file doesn't list. `pnpm arch` will likely go red. Either fix these edges or re-record with `pnpm arch:baseline` after checking the diff is only these edges.
- The strongest fixes, in order: move `settings`, `polling`, `pulls`, and `workspace` SQL into `repository.ts` plus `service.ts`; route `reviews/run-executor.ts` through `ReviewRepository`; move `isConfigChange` out of `agents/helpers.ts` to break the cycle.

I didn't check the skill's `$inferSelect` row-type claim in `reviews/repository.ts:19`. The cruiser can't detect it.