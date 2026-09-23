# Entry quality bar

## The test

If this would be obvious to anyone reading the code, don't write it. Every
entry must be **actionable cold**: an agent with no memory of this session must
be able to read it and know exactly what to do, or avoid, without
re-investigating.

## Vague vs useful

| ✗ Vague (reject) | ✓ Useful (accept) |
|---|---|
| "be careful with env vars" | "a key ever saved via Settings lands in `~/.devdigest/secrets.json` and outranks `server/.env` from then on — `LocalSecretsProvider` reads the file first (`server/src/adapters/secrets/local.ts`)" |
| "pnpm can be tricky" | "`reviewer-core/` installs with `npm ci`, not pnpm — the server imports its raw TS through a tsconfig path, and pnpm's symlinked layout can't resolve the transitive deps at runtime" |
| "obey the layering" | "put SQL in `repository.ts`, not `service.ts` — `service.ts` files are unit-tested with the DB adapter mocked, so a stray query there silently never runs in CI" |

## Always cite evidence

Every entry needs one of: a `file:line` reference in backticks, an exact error
string, or the exact command that reproduces or fixes the problem. An entry
with no evidence is a guess, not a finding.

## Don't record

- Anything already stated in an `AGENTS.md`, `README.md`, or `TESTING.md` —
  that's documentation's job, not `INSIGHTS.md`'s.
- One-off typo fixes or trivial config edits.
- A replay of the conversation. Replaying old conversations adds noise without
  signal — extract the insight, not the history of how it was found.

## Ranking candidates for the proposal step

When drafting candidates to propose, rank strongest first:

1. A user correction (direct evidence a default assumption was wrong)
2. A failure traced to a root cause
3. A decision made with a stated reason
4. A discovered convention

## File hygiene

~200 entries per file is the point where signal-to-noise drops. Past that,
prune stale entries or split the file by domain.
