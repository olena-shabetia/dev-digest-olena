# INSIGHTS — reviewer-core

Append-only log of problems already hit. Newest first. One entry per problem:
symptom → cause → fix → rule.

When an entry hardens into a standing rule, promote one line into `CLAUDE.md`
and shorten the entry here to a pointer.

---

## 2026-09-17 — this package installs with npm, not pnpm

**Symptom:** per the note in `scripts/dev.sh`, a missing
`reviewer-core/node_modules` makes the API crash at boot with
`ERR_MODULE_NOT_FOUND` — even though nothing in `server/` looks broken.

**Cause:** the server imports this package's RAW TypeScript source through a
tsconfig path alias (`@devdigest/reviewer-core` → `../reviewer-core/src/index.ts`),
so its transitive dependencies must be resolvable at runtime from this directory.
pnpm's strict, symlinked `node_modules` layout does not satisfy that; npm's flat
layout does. Hence `npm ci` here and pnpm everywhere else.

**Fix:** `cd reviewer-core && npm ci`. `scripts/dev.sh` does this automatically
when `node_modules` is absent, so it usually only bites on a manual install.

**Rule:** never "unify" this package onto pnpm without first proving the API
still boots. The split is deliberate, not an oversight.
