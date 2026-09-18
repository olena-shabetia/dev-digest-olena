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
