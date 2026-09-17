# DevDigest — repository map

Local-first AI pull-request reviewer. Lessons L01–L08 add features back.

## Session protocol

This file holds stable configuration. `INSIGHTS.md` holds evolving knowledge
discovered during sessions. Both are binding.

**Before any work:** read the `INSIGHTS.md` of every module the task touches
(routing table in the `engineering-insights` skill). Briefly summarize what you
loaded from it — the entries that bear on the task, or that none do — so it is
visible that it was processed. Treat them as high-confidence guidance unless told
otherwise. Then search that package's `docs/` and `specs/` — they may already
answer the question — and only then read code.

**Before finishing:** run the `engineering-insights` skill. Do not skip it. It
proposes entries for approval rather than writing on its own, and if nothing this
session met its bar it writes nothing — a valid result, not a reason to skip the
step.

## Map

Four independent packages, **not** a pnpm workspace: each has its own lockfile,
and cross-package code resolves through tsconfig `paths` onto RAW TypeScript
source, not build output. `repo-intel` (the indexer) lives INSIDE `server/`, not
as its own package. Full folder/port/purpose table → `README.md`.

`server/src/vendor/shared/` is the CANONICAL copy of the Zod contracts; the one
under `client/src/vendor/shared/` is derived — edit the server one first, then
sync.

## Versions that change the code you write

Zod **3** (not 4) · Fastify **5** · Drizzle **0.38** · Next **15** App Router ·
React **19** · Tailwind **4**

## Conventions you cannot guess from the code

- There is no root `package.json`; commands, stack, and how-to-run are in
  `README.md` — don't duplicate them here, read it.
- ESM imports carry the `.js` extension (server + reviewer-core; client/Next
  does not need this).
- The server deliberately does NOT run migrations on boot.
- Secrets never go through `AppConfig` or `process.env` in feature code — only
  through `SecretsProvider`. The single env read point is
  `server/src/adapters/secrets/local.ts`.

## Do not touch

- `server/clones/**` — gitignored clones of other repos, currently holding a FULL
  copy of THIS repository. Never grep or edit here: every file is found twice.
- `server/src/db/migrations/**` — applied migrations are immutable. Schema change
  means `pnpm db:generate` plus a new file.
- `*/src/vendor/**` — vendored, looks editable but is not.

## Read when

- Working inside one package → `server/CLAUDE.md` · `client/CLAUDE.md` ·
  `reviewer-core/CLAUDE.md` · `e2e/CLAUDE.md`
- Editing reviewer system prompts → `docs/agent-prompts/README.md`
- Choosing a model for an agent → `docs/agent-prompts/choosing-a-model.md`
- A test broke, or asking which suite covers what → `TESTING.md`
- A symptom feels familiar → `INSIGHTS.md`
- Building a lesson feature → write the spec first: cross-package ones in
  `specs/<lesson>-<slug>.md`, package-local ones in `<package>/specs/`
