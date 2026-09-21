# Severity — the rubric this skill owns

DevDigest already defines a severity enum:
`Severity = z.enum(['CRITICAL','WARNING','SUGGESTION'])`
(`server/src/vendor/shared/contracts/findings.ts:11`), ordered by
`SEVERITY_ORDER` (`client/src/lib/severity.ts:10`). Emit exactly these three —
**do not invent a fourth level or a different scale.** No consulted skill
defines a compatible one: `onion-architecture` and `frontend-ui-architecture`
have zero severity vocabulary (binary rules only); `react-best-practices`
uses CRITICAL/HIGH/MEDIUM; `security` uses a HIGH/MEDIUM/LOW *confidence*
axis, not severity. All of those get mapped below — never passed through
verbatim.

**Only CRITICAL blocks the push.**

| Level | Meaning | DevDigest examples |
|---|---|---|
| **CRITICAL** | Broken or unsafe; merging makes the repo worse in a way CI or prod notices. **Blocks.** | Any Tier 1 gate `status:"fail"` · a `depcruise --ignore-known` violation (i.e. new, not in the baseline) · a Drizzle query missing `workspace_id` scoping · a `process.env` / secret read outside `server/src/adapters/secrets/local.ts` · I/O or an infra import (`fastify`, `drizzle-orm`, `node:fs`, an SDK) entering `reviewer-core/src/**` · a modified or deleted file under `server/src/db/migrations/**` · vendor-shared drift (`check-vendor-sync.sh` exit 1) · a relative ESM import missing its `.js` extension in `server/`/`reviewer-core/` · a Zod-4-only API (repo is Zod 3) |
| **WARNING** | Real defect or layering break, but it compiles. | Business logic in `routes.ts` · a Drizzle call inside `service.ts` · a module with no `service.ts`/`repository.ts` tier · an import-direction break in `client/` (route-local code reached from outside its route, or vice versa) · a bare `fetch` in a component instead of `lib/hooks/*` · a lesson-shaped diff with no spec (see below) |
| **SUGGESTION** | Worth fixing, not worth blocking. | Placement-table drift noted in `onion-architecture`/`frontend-ui-architecture` reference docs · a component not promoted on its 2nd consumer · a new `Record<Severity,string>` outside `tokens.ts` · a missing `next-intl` key · a gate `status:"skipped"` |

There is **deliberately no fourth level.** Formatting, naming, import order,
and comment quality are not reported at all — the same discipline the
`security` skill applies to its own LOW-confidence tier ("do not report"). A
reviewer that lists taste items trains people to skim it, and this one has to
survive being read every time it blocks a push.

## Mapping — each source's native output → this scale

| Source | Native output | → |
|---|---|---|
| `tsc --noEmit` (any package) | non-zero exit | CRITICAL |
| `eslint` (`pnpm lint` / `npm run lint`) | non-zero exit (the gate's own exit code — see note) | CRITICAL |
| `depcruise --ignore-known` | non-zero exit (i.e. a violation not already in `.dependency-cruiser-known-violations.json`) | CRITICAL |
| `depcruise --ignore-known` | zero exit | not reported — grandfathered violations are invisible to this gate by design |
| `./scripts/check-vendor-sync.sh` | non-zero exit | CRITICAL |
| any gate | `status:"skipped"` (missing `node_modules`) | SUGGESTION, and set `completeness:"partial"` — **never** CRITICAL; a fresh clone must stay pushable |
| spec-first check | lesson-shaped diff, no spec file in the diff | WARNING |
| `security` | HIGH impact + HIGH confidence, translated to a real Fastify/Drizzle finding (routing.md) | CRITICAL |
| `security` | HIGH impact + MEDIUM confidence | WARNING |
| `security` | MEDIUM impact, any confidence | SUGGESTION |
| `security` | LOW confidence, any impact | dropped — the skill's own rule |
| `onion-architecture` | a `## Pre-flight checklist` item broken | WARNING; CRITICAL only if it's an infra type/import entering `reviewer-core/` (purity break) |
| `frontend-ui-architecture` | a `## Before adding any file` item broken | WARNING |
| `react-best-practices` | its own CRITICAL / HIGH / MEDIUM | WARNING / SUGGESTION / dropped, respectively |
| `zod`, `typescript-expert`, `fastify-best-practices`, `drizzle-orm-patterns`, `postgresql-table-design`, `react-testing-library`, `next-best-practices`, `mermaid-diagram` | anything | SUGGESTION ceiling — none of these can produce a CRITICAL through this skill |

**Note on eslint:** `pnpm lint` exits non-zero on error-level (severity 2)
violations by default in this repo's configs; a run that only has warnings
still exits 0. So "the gate failed" already means real errors — there's no
need to parse eslint's own JSON output to separate errors from warnings, the
gate's exit code already did that.

## Never critical, no matter the source

Formatting, naming, missing tests ("needs a test" is a SUGGESTION at most;
only a *deleted, previously-passing* test is a WARNING), missing JSDoc, "this
could be simpler," anything the reviewer can't attach a `file:line` to,
anything on the IGNORE list (routing.md), anything already inside the
depcruise baseline. `react-best-practices`' own "Over-Engineering (CRITICAL)"
tag is a taste rule wearing a severity label — treat it as SUGGESTION here,
per the mapping table above (its native HIGH/MEDIUM already floor most of its
findings below WARNING; "Over-Engineering" specifically never earns more than
SUGGESTION regardless of its native tag).

## Spec-first check (Tier 1, path logic — not an LLM judgment)

Root `AGENTS.md`: *"Building a lesson feature → write the spec first."* This
is pure path arithmetic and lives in `scripts/pr-self-review-gates.sh`, not in
the routed review:

> If the diff adds or modifies a file under `server/src/modules/**` or
> `client/src/app/**/_components/**`, **and** no file matching `specs/*.md`,
> `client/specs/**`, `server/specs/**`, or `reviewer-core/specs/**` is in the
> diff → one WARNING: *"feature files changed with no spec — AGENTS.md
> requires the spec first (`specs/<lesson>-<slug>.md` for cross-package,
> `<package>/specs/` for local)."*

WARNING, never CRITICAL — refactors and bug fixes legitimately touch feature
files with no new spec, so this must inform, never block.
