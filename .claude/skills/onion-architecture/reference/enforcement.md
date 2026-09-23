# Enforcement — `pnpm arch`

Mechanical layer checking via `dependency-cruiser`, config at
`server/.dependency-cruiser.cjs`. No new dependency was added — `^17.4.3` was
already in `server/package.json`, used as a library by
`server/src/adapters/depgraph/index.ts:18`.

## Running it

```bash
cd server
pnpm arch            # the CI gate — fails only on NEW violations
pnpm arch:report     # human-readable, prints each rule's full explanation
pnpm arch:baseline   # re-record the known-violations file after a real fix
```

`pnpm arch` uses `--ignore-known`, which reads
`server/.dependency-cruiser-known-violations.json` and fails only on
violations **absent** from that file. It does not fail when a baselined
violation gets fixed — cleanups go green without touching the baseline file.
Still, re-run `pnpm arch:baseline` after a genuine fix so the file shrinks;
otherwise it silently keeps permitting a violation that no longer exists,
which would hide a regression if the same edge reappears later.

## Reading a violation

`pnpm arch:report` prints the rule name, the `from`/`to` file pair, and the
rule's `comment` — that comment is written as the actual explanation of *why*
the rule exists, so read it before assuming the fix is "add an exception."

## Why `tsPreCompilationDeps: true` must never be flipped off

TypeScript elides an import if every binding from it is used only in type
position. Concretely: `import type { Db } from '../../db/client.js'` and
`import type { FastifyInstance } from 'fastify'` produce **no runtime code**,
so a dependency graph built from compiled output can't see them.

If `tsPreCompilationDeps` were `false` (the dependency-cruiser default), every
`import type` in the codebase — including the `FastifyInstance` type import in
every single `routes.ts` and the `Db` type import in `platform/container.ts`
— would be invisible to the cruise. The persistence and transport rules would
then report a clean pass while enforcing nothing: a service could add
`import type { Db }` today and a value-level `container.db.select()` call
tomorrow, and the first change (the one that actually signals coupling) would
never have tripped anything.

Turning it on has two costs, both accepted deliberately:

1. **Slower cruise** — it runs TS module resolution per file rather than a
   compiled-output scan. A few seconds for ~150 files; acceptable for a CI gate.
2. **More visible edges** — `import type { FastifyRequest }`
   (`modules/_shared/context.ts:1`) and `import type { FastifyPluginAsync }`
   (`modules/index.ts:1`) both become visible fastify edges. Both are
   legitimate and are carved out of `no-fastify-outside-transport` explicitly
   — see the config's `from.pathNot` list. If you add a new file outside
   `routes.ts` that needs a Fastify *type* for a genuinely good reason, extend
   that carve-out list with a comment explaining why, rather than disabling
   the rule.

## Why `clones/` must stay excluded

`server/clones/` is a full, gitignored copy of this repository (see
`server/INSIGHTS.md`, 2026-09-17 — the app cloned itself because
`DEVDIGEST_CLONE_DIR` resolved relative to the package). The config's
`exclude.path` kills it explicitly. If that exclusion is ever removed, every
single rule above will double- or triple-report, since dependency-cruiser will
walk the nested copy as if it were separate source.

## Matching npm packages: match the RESOLVED path, not the specifier

`path`/`pathNot` matchers in a rule run against the **resolved** file path
dependency-cruiser found for that edge — not the string written in the
`import` statement. For an npm package this resolved path looks like
`node_modules/.pnpm/<pkg>@<version>.../node_modules/<pkg>/...` (pnpm's nested
layout) or, for some packages, the bare specifier itself with no path at all
(observed for `octokit`). A rule written as `path: '^drizzle-orm'` or
`pathNot: ['^zod$']` matches **neither** shape and silently never fires —
this is exactly the false-clean failure mode `enforcement.md`'s
`tsPreCompilationDeps` section warns about, from a different cause.

The `pkg(name)` helper at the top of `.dependency-cruiser.cjs` builds all the
patterns a package name needs. Use it for any new SDK or npm dependency added
to a rule — never hand-write a bare `^pkgname$`-style pattern.

A related trap: `exclude: { path: '...node_modules...' }` doesn't narrow what
a rule can match, it **deletes the edge from the graph before any rule runs**.
That's why this config's `exclude` does NOT list `node_modules` — only
`doNotFollow` does, which keeps the edge visible for matching while still
skipping the package's internal files.

## Adding a new rule

If you add a rule, give it a `comment` written for a human reading
`arch:report` output, not for the config author. Then re-run
`pnpm arch:baseline` once to freeze any pre-existing matches for that new
rule — otherwise CI goes red for violations nobody introduced today.
