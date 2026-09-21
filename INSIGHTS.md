# INSIGHTS — repository-wide

Append-only, newest entry first per section. See the `engineering-insights`
skill for the read/write/promotion contract.

Scope: things that cross package boundaries. Package-local entries belong in
`server/INSIGHTS.md`, `client/INSIGHTS.md`, `reviewer-core/INSIGHTS.md`,
`e2e/INSIGHTS.md`. Do NOT let this file grow into documentation.

---

## What Works

_None yet._

## What Doesn't Work

_None yet._

## Codebase Patterns

_None yet._

## Tool & Library Notes

### 2026-09-17 — pnpm 12 silently blocks build scripts and writes a bad stub

**Symptom:** `pnpm install` ends with `ERR_PNPM_IGNORED_BUILDS` listing
`esbuild`, `sharp`, `ssh2`, `cpu-features`, `protobufjs`. Untracked
`server/pnpm-workspace.yaml` and `client/pnpm-workspace.yaml` appear, containing
the literal placeholder `set this to true or false` — which is not valid config.

**Cause:** pnpm 10+ does not run post-install scripts by default and generates an
`allowBuilds` stub for you to fill in. The repo targets pnpm ≥10 but ships no
`onlyBuiltDependencies`, so the stub is generated on every fresh install.

**Fix:** delete both stubs. The blocked builds are not needed here — `tsx`
bundles its own esbuild, and `sharp` is an optional Next transitive dep used only
for production image optimization. Verified: API and web both boot and serve 200.

**Rule:** do not blanket-approve build scripts to make a warning go away. Check
whether the binary is actually reachable at runtime first.

### 2026-09-21 — `pnpm install --frozen-lockfile` (what CI runs) hits the same error, even on an untouched lockfile

**Symptom:** `pnpm install --frozen-lockfile` — the exact command every CI
workflow step runs — exits 1 with `ERR_PNPM_IGNORED_BUILDS` in `server/` and
`client/`, reproduced even after reverting to the pre-existing, untouched
`package.json`/lockfile (i.e. not caused by any dependency added this
session).

**Cause:** the hard-fail-on-unapproved-builds behavior above is version-gated
in pnpm, and this local shell has pnpm 12.4.2 installed globally, while every
CI workflow pins `pnpm/action-setup@v4` to `version: 10` — the version that
predates (or doesn't enforce) this hard error. That's the likely reason CI has
never surfaced this: it never runs the pnpm version that fails here.

**Fix:** none needed for CI as configured today. Packages fully install and
link to `node_modules` before pnpm errors at the end — `rm -f
pnpm-workspace.yaml` (now gitignored) after each local install is enough to
keep working locally.

**Rule:** if the CI pnpm version pin (`pnpm/action-setup@v4` in any
`.github/workflows/*.yml`) is ever bumped past whatever version introduced
`ERR_PNPM_IGNORED_BUILDS`, every `pnpm install --frozen-lockfile` step in CI
will start failing — verify this specifically before bumping that pin.

## Recurring Errors & Fixes

_None yet._

## Session Notes

_None yet._

## Open Questions

_None yet._
