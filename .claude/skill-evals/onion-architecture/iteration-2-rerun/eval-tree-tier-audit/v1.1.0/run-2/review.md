## Module tier audit: `server/src/modules/`

I audited the real project at `/home/olena/projects/dev-digest-olena`. The fixture copy under `scratchpad/fixtures/tc4` has identical modules. The audit covers 17 feature modules and skips `_shared/` and `index.ts`. I read only; I changed no code and did not open the PR.

**Four modules break the onion rules: `polling`, `workspace`, `settings`, `pulls`.** Every other module passes the four rules from the skill.

### Findings

**1. `polling/`** (routes-only module; breaks rules 1, 2, 3)
- `routes.ts:4-5` imports `drizzle-orm` and `db/schema.js`.
- `routes.ts:28-31` selects from `repos` inside the route handler.
- `routes.ts:38-63` runs an upsert loop over pull requests. This is sync orchestration with GitHub, so it is business logic in the route.
- `routes.ts:66-69` updates `repos.lastPolledAt` inline.
- Missing: `service.ts` and `repository.ts`.

**2. `workspace/`** (breaks rules 1, 2; rule 3 does not apply)
- `routes.ts:3-4` imports `drizzle-orm` and `db/schema.js`.
- `routes.ts:21-24` queries `repos` inline.
- Missing: `repository.ts`. Lines 25-35 only map rows to a response DTO, so a `service.ts` is optional here.

**3. `settings/`** (breaks rules 1, 2, 3)
- `routes.ts:3,5` imports `drizzle-orm` and `db/schema.js`.
- `routes.ts:25-28`, `:55-61`, and `:63-66` query `settings` directly in routes.
- `routes.ts:52-67` runs the upsert loop for settings. `routes.ts:82-87` persists the BYO key and invalidates caches, and `routes.ts:89-96` runs the test-connection logic. All of this is business logic in routes.
- `feature-models.ts:1,8` imports `drizzle-orm` and `db/schema.js`. `feature-models.ts:41-44` runs a query outside any repository, and it is called by other modules.
- Missing: `service.ts` and `repository.ts`.

**4. `pulls/`** (breaks rules 1, 2, 3)
- `routes.ts:4,7` imports `drizzle-orm` and `db/schema.js`.
- Inline queries in `routes.ts` at lines 34, 56, 92, 112, 170, 176, 186, 188, 198, 200, 211, 228, 230, 271, and 275. These include deletes and inserts on `prFiles` and `prCommits` at 186-200.
- `routes.ts:12` does import `pulls/repository.ts`, but only `reviewAggregatesByPr` from it. The repository tier exists and is bypassed for every other query.
- Missing: `service.ts`. The GET handler at `routes.ts:164` orchestrates status derivation and file/commit sync, and the POST handler at `routes.ts:302` also holds logic.

### Lower-severity notes (not rule violations)
- `reviews/run-executor.ts:6` and `reviews/diff-loader.ts:4` import `db/schema` only for `typeof` types (`run-executor.ts:60,197,535`; `diff-loader.ts:17`). They run no queries. The anti-patterns doc calls `run-executor` a service reaching past its repository, but the code only uses the type, so I did not count it as a finding.
- `repos/helpers.ts:2` imports the schema for `$inferSelect` type only and maps to a DTO. This is allowed.
- The `reviews/service.ts:10` import of `AgentRow` is also type-only.

### Passing modules
`agents`, `blast`, `brief`, `conventions`, `intent`, `onboarding`, `pr-history`, `project-context`, `repo-intel`, `repos`, `reviews`, `skills`, `smart-diff`. The `blast`, `pr-history`, `project-context`, and `smart-diff` modules have no queries, so they need no repository. No service file imports the DB directly.

### Stale reference
`.claude/skills/onion-architecture/reference/anti-patterns.md` cites line numbers that no longer match the code. For example, it puts the `settings` queries at lines 30, 53, and 61, but they are at 25, 55, and 63 now. It also says `pulls/routes.ts` is 314 lines, which I did not check. Use the line numbers above, and update that doc before citing it in the PR.

Before the PR, run `pnpm arch`. The anti-patterns doc says these violations are frozen in `server/.dependency-cruiser-known-violations.json`, so CI should pass. I did not verify that baseline.

Want me to draft the `repository.ts` and `service.ts` extraction for `polling`, `workspace`, and `settings`, starting with the smallest?