# `conventions` — Conventions Extractor (HW2)

Scans a cloned repo, proposes house-rules with a cheap LLM, verifies every
cited `file:line` against real code, and lets a human accept/reject/edit
before rolling the accepted rules into a `repo-conventions` skill.

See `server/specs/L02-conventions-extractor.api.md` for the full route table
and design rationale, and the cross-package `specs/L02-conventions-extractor.md`
for the pipeline + candidate lifecycle.

## Layering

- `routes.ts` — HTTP + Zod only; registers the extract job handler at plugin load.
- `service.ts` — sampling → LLM → verification → persist; PATCH semantics;
  skill build + agent link. Zero SQL.
- `repository.ts` — Drizzle, workspace-scoped. Owns `conventions` +
  `convention_scans`.
- `sampler.ts` — clone I/O (deterministic file reads, no LLM).
- `prompt.ts` — pure `buildExtractMessages`; every repo excerpt wrapped via
  `wrapUntrusted`.
- `schemas.ts` — route-local Zod + the LLM structured-output schema.
- `helpers.ts` — pure: verification, dedupe, DTO mapping, skill-markdown render.
- `constants.ts` — sample sizes, job kind, default extraction model.

## Cross-module access

`container.skillsRepo` (added to `platform/container.ts`) and the existing
`container.agentsRepo`/`container.repoIntel` — never a direct import of a
sibling module's `repository.ts`/`service.ts` (`.dependency-cruiser.cjs`'s
`no-cross-module-imports`, `tsPreCompilationDeps: true` — even `import type`
trips it).

## Degradation

Every `repoIntel.*` call is wrapped in try/catch. No clone → 422 up front (no
tokens spent). No samples at all → `done` scan, `degraded: true`,
`degraded_reason`, zero LLM calls. LLM throws → scan `failed`, nothing
persisted to `conventions` for that run. A re-scan replaces prior `pending`
rows but always preserves `accepted`/`rejected` decisions.
