# INSIGHTS — server

Append-only, newest entry first per section. See the `engineering-insights`
skill for the read/write/promotion contract.

---

## What Works

_None yet._

## What Doesn't Work

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

### 2026-09-18 — `pulls/routes.ts` had aggregate SQL business logic inline in the route handler

**Symptom:** the PR-list route (`GET /repos/:id/pulls`,
`server/src/modules/pulls/routes.ts:31`) built a latest-review score lookup —
a full `SELECT` + `orderBy` + JS grouping — directly inside the Fastify
handler (was around `routes.ts:133-149` pre-fix), with no `repository.ts` in
that module at all.

**Cause:** the `pulls` module was never split into the
`routes → service → repository` layering `server/CLAUDE.md` mandates
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

_None yet._

## Recurring Errors & Fixes

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
`CLAUDE.md`), so a freshly created database has no schema until migrations are
applied explicitly.

**Fix:** `cd server && pnpm db:migrate`.

**Rule:** this is the first thing to check on any "works locally, broken on a
fresh clone/DB" report — before suspecting the code.

## Session Notes

_None yet._

## Open Questions

_None yet._
