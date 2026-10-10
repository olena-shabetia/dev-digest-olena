# Prioritization

## 1. Shipped vs tooling

Weight matters only where it ships or runs for users. Classify each workspace
first, and state the class in the report.

| Workspace | Class | Why |
|---|---|---|
| `server/` | ships | the API the team runs; deployment wiring lives in `docker-compose.yml` |
| `client/` | ships | the Next.js web app; its bundle reaches the browser |
| `reviewer-core/` | ships (as a library) | imported by `server/`; its deps go into the server's runtime |
| `mcp/` | ships (local) | a stdio MCP server users run on their machine |
| `evals/` | tooling | eval harness; never deployed |
| `e2e/` | tooling | browser test flows; never deployed |

A large dependency in a tooling workspace is still reported, but it is ranked
below the same weight in a shipped workspace (see the rules in §2). Verify the
class against the repo when it changes: check `docker-compose.yml` and `.github/workflows/`.

## 2. Priority levels

Each finding gets exactly one level. Use the highest level that applies.

**P0 — fix before the next merge.** These break builds, CI, or make results untrustworthy.
- `dual-lockfile` in any workspace (two sources of truth).
- `phantom-import` in a shipped workspace: works only because another install hoists it, so a clean install or Docker build fails.
- `missing-install` in a workspace whose checks CI runs: numbers and tests from it are not reliable.
- An `audit` item at **critical** or **high** severity in a shipped workspace (only with `--audit`).

**P1 — high impact, low risk to act on.**
- A runtime dependency in a shipped workspace with `closureBytes` ≥ 50 MB **and** `importingFiles` ≤ 2: candidate for lazy loading or replacement. (Example: `mermaid`, 111 MB closure, 1 file.)
- `unused-candidate` in a shipped workspace that the verification in §4 confirms.
- A cross-package edge that breaks the ring rules or reaches into another package's `src/` (`crossPackageEdges`), because it couples packages that should not know each other.
- Audit items at **moderate** severity in a shipped workspace (only with `--audit`).

**P2 — worth doing in a planned change.**
- `duplicate` of one package at two versions with `extraBytes` ≥ 1 MB in a shipped workspace (for example `@types/node` in `server/`, `reviewer-core/`, or `mcp/` with extra ~2 MB each).
- `range-drift` for a dependency that is used at runtime in more than one workspace (for example `zod`). Align the ranges so one resolved version serves all.
- Heavy tooling (`evals/`, `e2e/`) with `closureBytes` ≥ 100 MB: note it, do not block on it.

**P3 — hygiene.**
- `range-drift` for dev-only tools (`vitest`, `tsx`, `typescript`).
- `extraneous` entries reported by `npm ls`.
- `unused-candidate` for tooling packages, when a config file might consume them.
- Duplicates under 1 MB.

## 3. Ordering inside a level

Sort by impact, then by effort:

1. Shipped before tooling.
2. Larger `closureBytes` first.
3. Verified before candidate.
4. Smaller effort (`S` before `M`) when impact is equal.

Advice follows the same order. Never list a P3 hygiene item above a P1 cost item.

## 4. Verification commands

Run one check for each candidate before it leaves "candidate" status.

**Unused dependency** (`unusedCandidate: true`):
```bash
# No import found by the collector; confirm there is no dynamic, string or config use
rg -n "<name>" <workspace>/ --glob '!node_modules' --glob '!*.lock*' --glob '!clones/**'
```
If the only hits are comments, the package is unused. If it appears in a config
file (`*.config.*`, `.dependency-cruiser.cjs`, `eslint.config.*`), it is used
through config: keep it and note that. A bin used from an npm script
(`"scripts"` in `package.json`) also counts as used.

**Phantom import** (`phantom-import`):
```bash
rg -n "from ['\"]<name>['\"]" <workspace>/src <workspace>/test
```
Then check whether the package is declared in that workspace's `package.json`.
If it is not declared, it is a real phantom. A hit inside a fixture string is
not one; the collector already strips template literals, so a remaining hit
should be checked by eye.

**Duplicate versions**: find who pulls the older copy:
```bash
pnpm -C <workspace> why <name>          # pnpm
npm -C <workspace> explain <name>       # npm
```
Report the parent package that forces the older version. Do not suggest
`overrides` or `pnpm.overrides` unless the parent cannot be upgraded.

**Range drift**: list the declared ranges with
`rg -n "\"<name>\"" */package.json`.

**Missing install**: the fix is the workspace's own install command (the
developer runs it, not this skill):
- pnpm workspace: `pnpm install --frozen-lockfile` in that directory.
- npm workspace: `npm ci` in that directory.

**Dual lockfile**: decide the manager from the workspace's own docs
(`mcp/AGENTS.md`, `reviewer-core/AGENTS.md`, `e2e/AGENTS.md` say npm). Recommend
removing the other lockfile in its own commit; never edit either lockfile.

**Lazy-load candidate** (large runtime dep, few importers): show the importing
file and line:
```bash
rg -n "from ['\"]<name>['\"]|import\(['\"]<name>['\"]\)" <workspace>/src
```
If the import is static at the top of a module that is itself lazy, the cost is
already deferred. Say so instead of recommending a change.

## 5. Things this skill must not recommend

- Approving pnpm build scripts to silence `ERR_PNPM_IGNORED_BUILDS` (root INSIGHTS.md, 2026-09-17).
- Editing `*-lock.*` files, or running `pnpm dedupe` / `npm dedupe` inside the report (the developer runs installs; this skill only reads).
- Removing a package based on size alone. Size is a reason to look; a `verified` unused check is the reason to remove.
- Upgrading majors to save space. Note the cost of a major as its own item, with the breaking-change skill in mind when it applies.
