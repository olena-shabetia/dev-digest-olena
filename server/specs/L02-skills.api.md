# L02 — Skills (server)

Package-local API contract. See the cross-package spec `../../specs/L02-skills.md`
for the full feature scope, the trust rule's cross-package framing, and the
byte-identical-prompt invariant; this file covers the server-side contract and
the reasoning behind it, mirroring the `agents` module as the reference
implementation for versioning, workspace scoping and DTO mapping.

## Route table

New `skills` module (`server/src/modules/skills/{routes,service,repository,helpers,constants}.ts`),
registered in `server/src/modules/index.ts` alongside `agents`:

| Method | Path | Body | Response |
|---|---|---|---|
| GET | `/skills` | — | `z.array(Skill)` |
| GET | `/skills/:id` | — | `Skill` |
| POST | `/skills` | `CreateSkillBody` | `201: Skill` |
| PUT | `/skills/:id` | `UpdateSkillBody` | `Skill` |
| DELETE | `/skills/:id` | — | `Ok` |
| POST | `/skills/import/preview` | multipart file | `SkillImportPreview` |
| GET | `/skills/:id/versions` | — | `z.array(SkillVersion)` |
| GET | `/skills/:id/stats` | — | `SkillStats` |

Every query is scoped by `workspace_id`, same as `agents/repository.ts`.
`GET /skills/:id/versions` and `/stats` follow the agents module's nested-resource
pattern: `service.get(workspaceId, id)` first, 404 if absent, then the child
query (`agents/routes.ts`'s `/versions` handler is the template).

`skills/repository.ts` owns `skills` + `skill_versions` only — the agents
repository keeps owning the agent side of `agent_skills` (its own header
comment already declares that split); nothing here touches `agent_skills`.

## The versioning rule

A change to `body` bumps `skills.version` by one and snapshots the *new* body
into `skill_versions` (with `.onConflictDoNothing()`, same idiom as the agents
module's config-history write). A change to only `enabled`, `name`, or
`description` does **not** bump the version and does **not** write a
`skill_versions` row.

This is narrower than the agents module's own versioning: `AgentVersion`
snapshots a whole JSON config blob, so agents bump on config drift generally.
`skill_versions` stores only a `body` column, so the predicate that decides
"does this update deserve a version" is exactly "did `body` change" —
`helpers.ts`'s `isBodyChange`, mirroring `agents/helpers.ts`'s `isConfigChange`
but comparing one field instead of a config object.

`SkillVersion` also carries an optional `change_note` (nullable text, captured
alongside the `PUT` that bumped the version) — the mockup's Versions tab shows
a one-line summary per entry that the bare `version`/`body`/`created_at` tuple
has nowhere to store. `null` means no note was given at save time; the UI never
substitutes a placeholder string for it.

**Restore is not a rewrite.** The Versions tab's "Restore" action is a plain
`PUT /skills/:id { body: <old version's body> }` — it creates a *new* version
row with the old content rather than mutating history in place, the same
semantics as `git revert`. `skill_versions.version` numbers are never
reassigned or deleted by a restore.

## Why the untrusted-wrapping happens here, not in `reviewer-core`

Trust follows `skills.source`:

- `source: 'manual'` → the body is handed to `reviewPullRequest` as-is.
- `source: 'imported_url' | 'community'` → the body is wrapped with
  `wrapUntrusted('skill:<name>', body)` (re-exported from
  `server/src/platform/prompt.ts`) before it reaches `reviewPullRequest`. An
  imported skill is created `enabled: false`, so it cannot reach a prompt until
  a human reviews and enables it.

This decision — which sources are trusted, and where the wrapping is applied —
lives in `skills/helpers.ts`'s `resolveSkillBodies(links)`, called from
`reviews/run-executor.ts` before the `reviewPullRequest({...})` call. It does
**not** live in `reviewer-core`, for one reason: `reviewer-core/src/review/run.ts`
documents its `skills` input as "resolved skill bodies (NOT slugs)" — the
engine is a pure function of already-resolved text and must not know where a
body came from or whether it needs wrapping. Which sources are trusted is a
product policy (today: manual vs. imported/community; tomorrow, maybe a
per-workspace allowlist), decided by the module that reads the DB, not a
concern an engine invariant should ever have to account for. Moving the
decision into `reviewer-core` would also mean threading `source` through the
engine's input shape for no reason the engine itself needs — it only ever
concatenates text into a prompt.

The byte-identical invariant this feeds: `skills` is passed to
`reviewPullRequest` only when the resolved array is non-empty
(`...(skillBodies.length ? { skills: skillBodies } : {})`), never as
`skills: []`. An agent with zero enabled linked skills produces a prompt
identical to before this feature existed.

## Archive-import policy

Import is two-step — `POST /skills/import/preview` only parses and returns;
nothing is written to the DB until the client's follow-up `POST /skills`.

- Accepted inputs: `.md`/`.markdown` and `.zip` only. Anything else is a 400
  `ValidationError`.
- `.md`/`.markdown` → decode UTF-8 → `parseSkillMarkdown` (frontmatter →
  first `#` heading → filename stem, in that order, for `name`; frontmatter or
  first non-heading paragraph for `description`; `type` defaults to `custom`).
- `.zip` → entries are listed, never extracted to disk, using a pure in-memory
  unzip (`fflate`) rather than shelling out — this is what makes "executable
  parts are never processed" true by construction, not by policy. The skill
  core is picked by priority: `SKILL.md` at any depth wins; otherwise the
  single `.md`/`.markdown` at the shallowest depth; ambiguous or absent → 400
  `ValidationError`.
- **Every non-markdown entry in the archive is listed in the response's
  `ignored_entries` and is never decoded, never written, never executed.**
  `executable_entries` is the subset of `ignored_entries` that looks
  executable (`.sh`, `.js`, `.py`, `.exe`, or an executable file-mode bit) —
  a separate, explicit field so the UI can show "N executable files in this
  archive were ignored" as the on-camera proof of the trust story. Being a
  subset of `ignored_entries`, it is still information *about* those entries,
  never their content.
- The route returns the parsed `SkillImportPreview`; it does not insert. The
  client calls `POST /skills` with the previewed fields plus
  `source: 'imported_url'` and `enabled: false` to persist.

`@fastify/multipart` is registered in `app.ts` with
`limits: { fileSize: 256 * 1024, files: 1 }` (`IMPORT_MAX_FILE_SIZE` in
`skills/constants.ts`). Out of scope for this lesson: the `url.*`/`community.*`
import tabs — the drawer ships with the file tab only.

⚠️ Response-schema gotcha (`server/INSIGHTS.md`, 2026-09-21): the serializer
runs `safeParse` on the in-memory object before `JSON.stringify`, so an
undeclared key silently vanishes and a raw `Date` 500s. `Skill` has no
timestamp field — map `createdAt` out in `toSkillDto` and never return the raw
row, same as every other module's DTO mapper.

⚠️ Barrel-collision gotcha (`server/INSIGHTS.md`, 2026-09-21): before adding
`SkillImportPreview`/`SkillVersion`/`SkillStats` to `contracts/knowledge.ts`,
grep the whole `contracts/` directory for those identifiers — a duplicate
`export *` symbol vanishes from the barrel silently, with no build error.

## Two smaller additions to other modules (the Stats tab's real data)

This feature also fills in two routes on the **agents** module — not the
skills module — because the agent editor's own Stats tab needs them. Both are
completing contracts that already existed in full before this feature, not
inventing new scope:

- **`GET /agents/:id/stats`** — implements `AgentStats`
  (`contracts/observability.ts`), which was already fully specified end to end
  (`runs`, `findings_total`, `accepted`, `dismissed`, `pending`,
  `accept_rate`, `dismiss_rate`, `avg_findings_per_run`, `total_cost_usd`,
  `avg_cost_usd`, `avg_latency_ms`, `findings_by_severity`, `trend`) before
  this feature touched it, with a header comment naming this exact route and
  marking the file "L07, A5 owns this file." This feature adds one new,
  additive field: **`findings_by_category: Record<string, number>`**, the same
  `findings` join as `findings_by_severity` grouped by `category` instead.
  Because nothing consumed `AgentStats` before this field existed, adding it
  carries none of the "Zod silently strips an undeclared key" risk that
  extending an already-consumed contract would.
- **`GET /agents/:id/runs?limit=20`** — a run-history log, generalizing the
  existing `listRunsForPull` pattern (`reviews/repository/run.repo.ts`) to
  filter by `agentId` instead of `prId`. Reuses `RunSummary`
  (`contracts/trace.ts`) with one additive field, **`pr_number: z.number().int().nullable()`**,
  joined from `pull_requests.number`, so the run-history table's "PR" column
  can link back to the reviewed pull request. This is a raw row log, a
  different shape than the aggregate `AgentStats`, so it stays a separate
  endpoint rather than being folded into the stats DTO.

**Which `AgentStats` panels this feature implements — all of them.** Unlike
the skill-level Stats tab below, `AgentStats` was already fully specified as a
contract before this feature existed; implementing the route is filling in a
stub, not deciding what to ship. Every panel the original mockup shows for the
agent editor's Stats tab is real: summary tiles (runs, cost, duration, accept
rate), findings-by-severity, findings-by-category, and the run-history table.
Nothing on this tab is a placeholder. New indexes back the two hot query paths
this route needs (neither table had one on `agent_id` before): `agent_runs_ws_agent_idx`
on `(workspace_id, agent_id, ran_at)` and `reviews_ws_agent_idx` on
`(workspace_id, agent_id)` — generated via `pnpm db:generate`, never
hand-written.

Implementing `GET /agents/:id/stats` now is a deliberate, documented exception
to README's lesson boundary (per-agent stats is placed at L07): the contract
was already fully specified, and completing a stub is different from adding
new scope. The rest of L07 (multi-agent columns, conflicts, the memory
curator) is untouched.

**`GET /skills/:id/stats` is deliberately small — a different, narrower Stats
tab.** `SkillStats` is not a smaller version of `AgentStats`; it is a
different real-data boundary, because no table records which skill was active
on which run:

```ts
export const SkillStats = z.object({
  skill_id: z.string(),
  agents_using: z.array(z.object({ id: z.string(), name: z.string() })),
});
```

The only real number is `agents_using` — a plain `agent_skills` join, counted
and named for the delete-confirmation dialog and the skill detail panel's "Used
by N agents" tile. Pull frequency, accept rate, findings (30D), and a
findings-by-category donut all need a per-run skill-attribution table (e.g. an
`agent_run_skills` write on every run) that does not exist — `run_traces.trace.prompt_assembly.skills`
holds the *rendered text block* that went into a given run's prompt, not skill
ids, so "which of my skills contributed to this run" isn't queryable without
new schema. Adding that table is out of scope for this lesson. These panels
are **absent, not stubbed as zero** — the same "if there's nothing to show,
don't add it" rule applied to the agent Stats tab's cut panels below.

**Cut from `AgentStats`'s own tab, and why (not a `SkillStats` limitation):**
"Most-used skills" and "Most-pulled memory" are not part of `AgentStats` and
are not added by this feature. "Most-used skills" needs the same missing
per-run skill-attribution table as `SkillStats` above. "Most-pulled memory"
needs the `memory` table (`db/schema/knowledge.ts`) to actually be populated by
a curated-memory-pull feature, which is L05/L07 and isn't built — showing the
panel today would report all zeros, which is worse than omitting it.
