# server/ — @devdigest/api

Fastify API on :3001. Route map and diagrams live in `README.md`.

## Layering (strict — do not blur these)

```
routes.ts      → HTTP + Zod validation, zero business logic
service.ts     → business logic, zero SQL
repository.ts  → SQL via Drizzle, ALWAYS scoped by workspace_id
helpers.ts     → pure transforms
constants.ts   → literals
adapters/      → the outside world, BEHIND interfaces from @devdigest/shared
```

## Conventions

- A new feature module is `src/modules/<name>/routes.ts` exporting a default
  Fastify plugin, plus one import and one entry in `src/modules/index.ts`.
  Registration is STATIC, not autoload: native dynamic `import()` of `.ts` files
  is not portable across tsx, the bundler, and vitest.
- Adapters are resolved only through the DI container (`container.<x>`), never
  with `new` inside a service — tests swap them via `ContainerOverrides`.
- Every domain table carries `workspace_id`; every query scopes by it.
- Tests split by filename: `*.it.test.ts` are DB-backed (testcontainers
  Postgres), everything else is hermetic. Keep that split intact — the CI
  workflows filter on it.
- Errors: throw `AppError` subclasses from `platform/errors.js`. The global
  handler in `app.ts` maps them to the `{error: {code, message, details}}`
  envelope; validation failures become 422.
- Boot-time reaping of stale `running` runs assumes ONE API instance per DB.
  Multiple replicas would need per-instance scoping or heartbeats.
- `EMBEDDINGS_ENABLED=false` is the default and means ZERO OpenAI requests.
  Do not flip it on implicitly while implementing something else.
- When `REPO_INTEL_ENABLED=false` or an agent sets `repo_intel=false`, the
  assembled prompt must stay BYTE-FOR-BYTE identical to the pre-repo-intel
  shape. Review comparability rests on this — do not break it.
- Repo-intel enrichment is best-effort by design: every `repoIntel.*` call is
  wrapped in try/catch and degrades to omitting a prompt section. Never let an
  enrichment failure fail a run.

## Read when

- Route map / API diagram → `README.md`
- Touching the indexer → `src/modules/repo-intel/README.md`
- Test strategy across the repo → `../TESTING.md`
- Editing a seeded reviewer prompt → `../docs/agent-prompts/README.md`
  (the DB row wins at runtime; `src/db/seed-prompts.ts` only affects fresh seeds)
- Implementing a lesson feature → `specs/<lesson>-<slug>.md` (write the spec
  first if it does not exist yet)
- A symptom feels familiar → `INSIGHTS.md`
