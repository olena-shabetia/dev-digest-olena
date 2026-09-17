# INSIGHTS — repository-wide

Append-only log of problems already hit. Newest first. One entry per problem:
symptom → cause → fix → rule.

Scope: things that cross package boundaries. Package-local entries belong in
`server/INSIGHTS.md`, `client/INSIGHTS.md`, `reviewer-core/INSIGHTS.md`,
`e2e/INSIGHTS.md`.

Do NOT let this file grow into documentation. When an entry hardens into a
standing rule, promote one line into the relevant `CLAUDE.md` and shorten the
entry here to a pointer.

---

## 2026-09-17 — pnpm 12 silently blocks build scripts and writes a bad stub

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
