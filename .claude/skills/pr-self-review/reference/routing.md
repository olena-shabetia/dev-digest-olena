# Routing — which skill reviews which file

IGNORE is evaluated first and always wins; a file that matches IGNORE is
never routed and never reviewed, no matter what else matches.

## IGNORE list

```
**/node_modules/**  **/dist/**  **/.next/**  **/coverage/**
**/test-results/**  **/playwright-report/**
.devdigest/**  plans/**
server/clones/**                       # full self-copy — every file found twice
client/src/vendor/**                   # derived; but see the non-ignore below
**/pnpm-lock.yaml  **/package-lock.json  skills-lock.json
**/pnpm-workspace.yaml                 # the pnpm-10 stub, gitignored anyway
**/*.snap  **/*.{png,jpg,jpeg,svg,ico,woff,woff2,gif,webp}
```

## Three deliberate non-ignores

- **`server/src/vendor/shared/**`** is the *canonical*, hand-edited Zod
  contract source (`AGENTS.md`) — review it normally, routed to `zod` and
  `typescript-expert`.
- **`client/src/vendor/**`** is ignored for *content* review (it's a derived
  copy, never hand-edited), but its mere presence in the diff forces the
  `vendor-sync` gate to run. If the client copy moved while
  `server/src/vendor/shared/**` did not, that's the gate's job to catch as a
  CRITICAL "edited the derived copy instead of the canonical one" — don't
  also try to catch it here.
- **`server/src/db/migrations/**`** inverts by change type, not by path: an
  *added* file gets a light `postgresql-table-design` read; a *modified or
  deleted* one is an immediate CRITICAL — applied migrations are immutable
  (`AGENTS.md` → Do not touch).

## Routing table (first match wins)

| Glob | Skills |
|---|---|
| `server/src/db/migrations/**` (added only) | `postgresql-table-design` |
| `server/src/db/schema*.ts`, `server/src/db/schema/**` | `drizzle-orm-patterns`, `postgresql-table-design` |
| `server/src/modules/**/routes.ts` | `fastify-best-practices`, `onion-architecture`, `zod` |
| `server/src/modules/**/repository.ts`, `server/src/modules/**/repository/**` | `drizzle-orm-patterns`, `onion-architecture` |
| `server/src/modules/**/{service,helpers,constants}.ts` | `onion-architecture`, `typescript-expert` |
| `server/src/adapters/**`, `server/src/platform/**` | `onion-architecture` |
| `server/src/vendor/shared/**` | `zod`, `typescript-expert` |
| `reviewer-core/src/**` | `onion-architecture` (purity: zero I/O, only `openai` + `zod`), `typescript-expert`, `zod` |
| `client/src/app/**/_components/**`, `client/src/components/**` | `frontend-ui-architecture`, `react-best-practices` |
| `client/src/app/**/{page,layout,loading,error,not-found,route,template}.tsx` | `next-best-practices`, `frontend-ui-architecture`, `react-best-practices` |
| `client/src/lib/hooks/**` | `react-best-practices`, `frontend-ui-architecture` |
| `client/src/lib/**` (other) | `frontend-ui-architecture`, `typescript-expert` |
| `client/**/*.test.tsx`, `client/src/test/**` | `react-testing-library` |
| `server/**/*.test.ts`, `reviewer-core/**` (tests), `e2e/**/*.ts` | `typescript-expert` (+ `TESTING.md` conventions, not a skill) |
| `.github/workflows/**`, `scripts/**` | `security` only (workflow injection, secret exposure) |
| any `AGENTS.md` change | no skill — flag SUGGESTION "conventions moved, read the new text" |
| any `*.md` with a changed ` ```mermaid ` block | `mermaid-diagram` |

Anything reviewable that matches none of the above still gets a plain
correctness pass using `docs/agent-prompts/general-reviewer.md` as the lens
(it's written for this exact stack — Fastify 5, Drizzle over postgres-js,
zod, octokit — unlike the vendored `security` skill).

## `security` is not glob-routed

It's the largest skill and applies everywhere, so glob-routing it would load
it into every package subagent. Instead: one dedicated pass, over only the
files matching a cheap grep prefilter —

```
req.  reply.  process.env  dangerouslySetInnerHTML  child_process
exec(  fs.  sql`  Buffer.from
```

— typically 3–8 files out of a much larger diff. Also feed this pass
`docs/agent-prompts/security-reviewer.md`, which is stack-correct where the
vendored skill isn't (see the translation caveat below).

## Translation caveat — `security` is Express/Mongo-shaped

DevDigest is Fastify 5 + Drizzle/Postgres. Routed naively, `security` emits
confident, irrelevant findings. Translate before reporting anything from it:

| `security` skill says | In this repo, check instead |
|---|---|
| "missing auth middleware" (`router.use(auth)`) | a Fastify `preHandler` / `onRequest` hook actually registered on the route |
| "Mongoose parameterized query" (A05 Injection) | Drizzle is already parameterized — do not flag raw Drizzle query builder calls as injection |
| A01 Broken Access Control | *is every Drizzle query in this diff scoped by `workspace_id`?* — this is the real DevDigest tenancy check, and it's `onion-architecture`'s "always" rule (`SKILL.md:63`, `:90`), not a `security`-skill finding |
| A03 Supply Chain | a new dependency in `package.json` with no matching lockfile change — a real, checkable signal here |

If a `security` finding can't be restated in these terms, it's probably not
applicable to this stack — drop it rather than report it unmodified.

## Token budget

Fan out **per package, not per skill, not per file**: one subagent per
package present in the diff (max 4: server, client, reviewer-core, e2e), each
given only its own file list and the ≤4 skills routed to those files, plus the
one dedicated `security` pass described above. Subagents open `SKILL.md`
files only — a skill's `reference/*.md` is read only once a concrete candidate
needs classifying against it. Each subagent returns **JSON findings only, max
10, highest severity first** — no prose. The orchestrator merges, dedupes on
`(file, line, rule)`, and never loads a skill body itself.

If more than 40 files survive IGNORE + routing, keep the 40 with the most
changed lines (`added + removed`), list the rest under
`scope.omittedForBudget` in the report, and set `"completeness":"partial"`.
