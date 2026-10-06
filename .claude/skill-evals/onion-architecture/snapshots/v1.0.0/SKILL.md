---
name: onion-architecture
version: 1.0.0
description: >-
  Decides which backend ring a piece of code belongs to and who may import
  it — whether logic goes in routes.ts, service.ts, repository.ts, an
  adapter, a port, or reviewer-core; where a new port/adapter pair is
  declared; and how to keep Fastify, Drizzle and vendor SDKs out of the
  core. Use before adding a file under server/src/ or reviewer-core/src/,
  before adding a query or an SDK call, when a module has no service or
  repository tier, and when reviewing a change for layer violations. Does
  NOT cover Fastify route/plugin APIs (see fastify-best-practices), Drizzle
  query syntax (see drizzle-orm-patterns), or Zod schema authoring (see zod).
---

# Onion Architecture

This skill answers one question: **which ring does this code belong to, and
who is allowed to import it?** It is the backend counterpart to
`frontend-ui-architecture`.

| Question | Answer lives in |
|---|---|
| Which ring does this belong to / who may import it | this skill |
| Fastify plugin, hook, lifecycle, serialization API | `fastify-best-practices` |
| Drizzle query, relation, migration syntax | `drizzle-orm-patterns` |
| Zod schema authoring | `zod` (note: Zod **3**, not 4, in this repo) |
| DI container field resolution + `ContainerOverrides` | `server/docs/architecture.md` |

## The rings

Coupling points inward only — inner layers define interfaces, outer layers
implement them (Palermo, [Onion Architecture part 1](https://jeffreypalermo.com/2008/07/the-onion-architecture-part-1/)):

```
reviewer-core/src (pure: openai + zod, zero I/O)
  ← vendor/shared (ports + Zod contracts, canonical)
    ← modules/<name>/repository.ts   (SQL, workspace_id-scoped)
      ← modules/<name>/service.ts    (business logic, zero SQL)
        ← modules/<name>/routes.ts   (HTTP + Zod validation, zero business logic)
adapters/** implement the ports ─┘ (wired only at platform/container.ts)
```

This is not aspirational — the repo already has all five rings, named and
working:

| Ring | Exemplar |
|---|---|
| Domain core | `reviewer-core/src/**` — only dep is `openai` + `zod`; zero `fastify`/`drizzle` imports |
| Ports | `server/src/vendor/shared/adapters.ts` — `LLMProvider`, `Embedder`, `GitHubClient`, `GitClient`, `CodeIndex`, `AuthProvider`, `SecretsProvider` |
| Use cases | `modules/reviews/` — `routes.ts` → `service.ts` → `repository/{pull,review,run}.repo.ts` |
| Adapters | `server/src/adapters/**` — 9 `implements` of the ports above |
| Composition root | `platform/container.ts` + `app.ts` (`app.decorate('container', …)`), with `ContainerOverrides` as the test seam |

The gap is *consistency*, not absence — see `reference/anti-patterns.md`.

## Placement table

| Kind of code | Goes in |
|---|---|
| HTTP shape, Zod validation, status codes | `modules/<n>/routes.ts` — zero business logic |
| Orchestration, invariants, business rules | `modules/<n>/service.ts` — zero SQL |
| Any Drizzle query | `modules/<n>/repository.ts` or `repository/<x>.repo.ts` — **always** scoped by `workspace_id` |
| Pure transforms, row→DTO | sibling `helpers.ts` |
| Literals, thresholds | sibling `constants.ts` |
| New outbound integration | port in `vendor/shared/adapters.ts` + impl in `adapters/<n>/` + a `container` getter |
| Prompt assembly, grounding, reduce | `reviewer-core/src/**` — no I/O ever |
| Cross-cutting (errors, sse, jobs, config) | `platform/**` |
| Secrets | `SecretsProvider` only — single env read point is `adapters/secrets/local.ts` |

## Adding a port + adapter

1. Declare the interface in the canonical `server/src/vendor/shared/adapters.ts` (never the `client/` copy — that's derived).
2. Implement it in `adapters/<name>/`.
3. Add a lazy getter on `Container` plus a `ContainerOverrides` key in `platform/container.ts`.
4. Add a mock implementation to `adapters/mocks.ts` so tests can swap it in.

Exemplar: `SecretsProvider` (`vendor/shared/adapters.ts:281`) implemented by
`LocalSecretsProvider` (`adapters/secrets/local.ts:16`), whose docblock states
the goal outright: *"Swap for a VaultSecretsProvider later without touching
call sites."*

## Pre-flight checklist

Copy this and tick off before finishing a change under `server/` or `reviewer-core/`:

```
- [ ] Adding a query? → is there a repository.ts? If the module has none,
      create it — do NOT add a second inline query (server/INSIGHTS.md 2026-09-18)
- [ ] Query scoped by workspace_id?
- [ ] New SDK import (octokit, openai, simple-git, ast-grep, ripgrep, tiktoken)?
      → does it belong in adapters/** behind a port?
- [ ] Service calling `new SomeAdapter()`? → use container.<x> instead
- [ ] Importing another module's folder? → go via vendor/shared, platform, or _shared
- [ ] Touching reviewer-core? → still zero I/O, still only openai + zod?
- [ ] Returning a `$inferSelect` row outward? → map to a DTO in helpers.ts
- [ ] Ran `pnpm arch` before finishing?
```

## Reference

- [reference/anti-patterns.md](reference/anti-patterns.md) — real drift in
  this tree, with file:line and the fix; and the one deliberate exception
  that should NOT be "fixed".
- [reference/enforcement.md](reference/enforcement.md) — running `pnpm arch`,
  reading a violation, re-baselining after a fix, and why
  `tsPreCompilationDeps` must stay `true`.
- [reference/sources.md](reference/sources.md) — Onion Architecture
  originals, Node/TypeScript adaptations, stack-specific practices, and the
  enforcement-tooling comparison.
- `server/AGENTS.md` — the layering contract this skill expands on.
- `server/docs/architecture.md` — the DI container and `ContainerOverrides`.
- `server/INSIGHTS.md` — the `pulls/routes.ts` inline-SQL story in full.
