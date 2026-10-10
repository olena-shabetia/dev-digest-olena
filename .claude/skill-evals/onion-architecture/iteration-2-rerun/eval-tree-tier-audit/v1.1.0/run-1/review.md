Nine of the 17 feature modules break the rules, and the four routes-do-SQL modules are the most serious. Nothing was changed. I verified each finding against the current tree in `/home/olena/projects/dev-digest-olena/server/src/modules/`. The skill's anti-pattern doc is a snapshot and its line numbers have drifted, so I used the current lines.

## Routes doing SQL, with no service or repository (rules 1, 2, 3)

| Module | Findings |
|---|---|
| `settings` | `routes.ts:3,5` imports drizzle and `db/schema`. Queries at `:25-26`, `:55-56`, `:63-64`. No `service.ts`, no `repository.ts`. |
| `polling` | `routes.ts:4,5` imports drizzle and `db/schema`. Queries at `:28`, `:38`, `:66`. No `service.ts`, no `repository.ts`. |
| `workspace` | `routes.ts:3,4` imports drizzle and `db/schema`. Query at `:21`. No `service.ts`, no `repository.ts`. |
| `pulls` | `routes.ts:4,7` imports drizzle and `db/schema`. Queries at `:33`, `:55`, `:91`, `:111`, `:131`, `:169`, `:176`, `:186-188`, `:198-200`, `:210`, `:228-229`, `:270`, `:275`. Has a `repository.ts`, but no `service.ts`. Also `routes.ts:12` imports `reviewAggregatesByPr` straight from the repository, skipping any service. |

## Service-tier code reaching the DB or adapters directly (rules 1, 4)

- **`settings/feature-models.ts:1,8`**: a service-tier helper imports `eq` from drizzle and `db/schema`. It queries `container.db` at `:41`. The module has no repository to delegate to.
- **`reviews/run-executor.ts:6`**: imports `* as schema from '../../db/schema.js'`. It is used at `:60`, `:197`, `:535` for row types only. It also already holds a `ReviewRepository`, so the import is avoidable. Type-only usage is a lower-severity finding.
- **`reviews/diff-loader.ts:4`**: same pattern as `run-executor.ts`, with the schema used at `:17` for a row type.
- **`repo-intel/service.ts:22,28`**: imports concrete adapters (`adapters/codeindex/extract.js`, `adapters/astgrep/index.js`) instead of going through ports or `container`.
- **`repo-intel/service.ts:29-30`**: imports `node:fs/promises` and `node:path` directly. That is filesystem I/O in the service tier.
- **`repo-intel/pipeline/incremental.ts:22-23`** and **`pipeline/full.ts:29-30`**: pipeline files import the same concrete adapters.

## Cross-module import (rule 4 / module isolation)

- **`repos/service.ts:11-14`**: imports `INDEX_JOB_KIND` and `REFRESH_JOB_KIND` from `../repo-intel/constants.js`. Per the skill, promote to `vendor/shared` or `platform/` if cross-cutting, or expose through `RepoIntelService`.

## Stale doc entries

- **`repo-map.ts` tokenizer import**: the anti-pattern doc says `repo-intel/pipeline/repo-map.ts` imports `adapters/tokenizer` directly. My grep found no such import in the current tree, so I did not report it.

## Modules with no tier violations

`agents`, `brief`, `conventions`, `intent`, `onboarding`, `skills`, `blast`, `pr-history`, `project-context`, `smart-diff`, `reviews` (apart from the two files above), and `repos` (apart from the cross-module import). Routes in these modules have zero DB imports, and service files use `container.db` only to construct repositories.

## Not checked

- **Row types in repositories**: I did not re-verify the `$inferSelect` row-type leak in `reviews/repository.ts:19`. It is not machine-detectable, so it needs a manual pass.
- **`pnpm arch`**: I did not run it. The results above come from the tier script and greps, not dependency-cruiser.

Before opening the PR, the cheapest high-value fix is the four routes-only modules, since each needs a `service.ts` and `repository.ts` extracted. The other items can be frozen as known violations or split into follow-up PRs. Tell me which you want and I'll make the changes.