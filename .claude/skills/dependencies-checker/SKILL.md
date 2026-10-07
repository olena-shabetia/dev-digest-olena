---
name: dependencies-checker
version: 1.0.0
type: Analysis
description: >-
  Audits every dependency of the DevDigest monorepo and its components:
  inventories each package with its installed size, runtime or dev kind and
  importers; draws a Mermaid schema of packages and internal module edges;
  flags duplicates, version-range drift, phantom and unused dependencies,
  dual lockfiles and stale installs; then prioritizes the findings (P0–P3) and
  gives concrete advice. Use when the user asks to check, audit, map or weigh
  dependencies, asks what makes node_modules heavy, asks for a dependency
  graph or schema, or invokes /dependencies-checker. Read-only: never installs,
  upgrades or edits lockfiles.
---

# Dependencies Checker

Produces one structured report a developer can read top to bottom: what
depends on what, what each piece weighs, what is wrong, what to do first.

Output language follows the user's request (the team writes in Ukrainian; keep
package names, versions and commands verbatim).

## Guardrails

- **Read-only.** Never run `pnpm install`, `npm ci`, `pnpm update`, `npm update`
  or `pnpm dedupe`, and never edit a file under `*-lock.*`. The root `CLAUDE.md`
  lists lockfiles as "never hand-edit"; this skill only reads them. Suggested
  fixes go into the report as commands for the developer to run, never executed
  directly.
- **Skip `server/clones/**`.** It is a gitignored full copy of this repo. The
  collector uses `git ls-files`, which already excludes it. Never grep it by hand.
- **Network only on request.** The default run is offline. `--audit` (CVE scan)
  is the only network step; run it only when the user asks for security or
  vulnerabilities.
- **Heuristics are labelled.** Unused and phantom findings are candidates with a
  verification step, not verdicts.

## Session protocol

Root `CLAUDE.md` requires reading the touched packages' `INSIGHTS.md` first and
running `engineering-insights` before finishing. For this skill the touched
scope is the whole repo, so:

1. Before running anything, read root `INSIGHTS.md` and each package
   `INSIGHTS.md` that exists (`server/`, `client/`, `reviewer-core/`, `e2e/`,
   `mcp/`). Summarize in one or two lines the entries that bear on the report.
   Entries that already matter here, from the root file:
   - pnpm 10+ blocks build scripts and writes a `pnpm-workspace.yaml` stub. Do not
     recommend approving build scripts to silence a warning. The stub is gitignored.
   - CI runs `pnpm install --frozen-lockfile`. An out-of-sync lockfile breaks CI
     even when local installs look fine.
2. Search `docs/` and `specs/` only if a question needs them. The report is about
   manifests and installs, so usually they are not needed.
3. Finish with `engineering-insights` (only if a non-obvious finding surfaced,
   e.g. a dual-lockfile trap or a stale install that hid real results).

## Workflow

```
- [ ] 1. Read INSIGHTS.md files (see Session protocol) and summarize relevant entries
- [ ] 2. Run the collector:  node .claude/skills/dependencies-checker/scripts/collect.mjs > <scratch>/deps.json
        (add --audit only if the user asked about vulnerabilities)
- [ ] 3. Check the collector's `problems` first. Missing installs make sizes
        unreliable, so say so at the top of the report if any exist.
- [ ] 4. Classify each package by where it ships (reference/prioritization.md §1)
- [ ] 5. Build the report in the section order of reference/report-template.md
- [ ] 6. Verify each "unused" and "phantom" candidate with one grep before
        listing it as a finding (commands in reference/prioritization.md §4)
- [ ] 7. Apply the priority rules (reference/prioritization.md §2–3) and write
        the advice; every advice item gets a verification command
- [ ] 8. Run engineering-insights if the session met its bar; otherwise say nothing
```

Write the collector output to the session scratch directory, not into the repo.
The report is delivered in chat. Save it as a file under `docs/` only when the
user asks.

## What the collector measures

`scripts/collect.mjs` (Node built-ins only, about 3 seconds) returns JSON:

| Field | Meaning |
|---|---|
| `workspaces[].deps[].ownBytes` | size of the package's own installed directory (`du -sb`) |
| `workspaces[].deps[].closureBytes` | own size plus every unique transitive directory it pulls in |
| `workspaces[].deps[].transitiveCount` | number of unique transitive packages |
| `workspaces[].deps[].importingFiles` | code files that import the package; 0 is a candidate |
| `workspaces[].duplicates` | one package installed at several versions in one workspace, with `extraBytes` |
| `rangeDrift` | same dependency declared with different ranges in different workspaces |
| `crossPackageEdges` | relative imports that leave one package and enter another |
| `workspaces[].internalEdges` | module-to-module import counts inside a package (feeds the diagram) |
| `problems` | `dual-lockfile`, `missing-install`, `extraneous`, `phantom-import`, `tree-problem` |
| `audit` | only with `--audit`: raw `pnpm audit` / `npm audit` output per workspace |

What it does **not** measure: client bundle size (needs `next build` and the
bundle analyzer), CVE status without `--audit`, outdated versions, and license
data. Say so in the report's "Method and limits" section.

## Output

Use [reference/report-template.md](reference/report-template.md) for the exact
section order and tables, and [reference/prioritization.md](reference/prioritization.md)
for the priority rules, the shipped-vs-tooling split, and the verification commands.

Hard rules for the report:

- Lead with a short summary: total installed size, number of P0 and P1 items,
  and whether any install is stale.
- Every size is a number with a unit, and every number comes from the JSON.
  Never estimate a size.
- Every advice item names the action, the file or package, and one command that
  checks the result.
- Keep the diagram readable: at most about 25 edges in the component diagram.
  Show the rest as a count.

## Reference

- [reference/report-template.md](reference/report-template.md) — section order, table columns, Mermaid templates.
- [reference/prioritization.md](reference/prioritization.md) — shipped vs tooling, P0–P3 rules, candidate verification commands.
