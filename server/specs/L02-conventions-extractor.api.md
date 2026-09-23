# L02 — Conventions Extractor (server)

Package-local API contract. See the cross-package spec
`../../specs/L02-conventions-extractor.md` for the full feature scope, the
verification contract, and the candidate lifecycle; this file covers the
server-side contract and the reasoning behind it, mirroring `repo-intel` (job
handler registration, degraded-contract shape) and `skills` (versioning,
workspace scoping, DTO mapping) as reference implementations.

## Route table

New `conventions` module
(`server/src/modules/conventions/{routes,service,repository,sampler,prompt,schemas,helpers,constants}.ts`),
registered in `server/src/modules/index.ts` alongside `skills`:

| Method | Path | Body | Response |
|---|---|---|---|
| POST | `/repos/:id/conventions/extract` | — | `202: {scan_id, job_id}` |
| GET | `/repos/:id/conventions` | — | `{scan: ConventionScan \| null, candidates: ConventionCandidate[]}` |
| PATCH | `/conventions/:id` | `{status?, rule?, category?}` | `ConventionCandidate` |
| POST | `/repos/:id/conventions/skill` | `{agent_id?}` | `Skill` |

Every query is scoped by `workspace_id` (`conventions/repository.ts`). `GET`
is a pure DB read — no clone I/O, no LLM — so it is safe to poll from the
client while a scan runs, and its result is identical before and after an API
restart (criterion: restart durability).

## Contracts (`vendor/shared/contracts/knowledge.ts`)

`ConventionCandidate` was reshaped from its unused HW1 scaffold (`{id, rule,
evidence_path, evidence_snippet, confidence, accepted}`) into the full DTO:
`category`, `scan_id`, the flat `evidence_*` fields mirroring `evidences[0]`
(the highest-ranked occurrence), the full `evidences[]` array, `status`
(replacing the old boolean `accepted`), and `edited`. `ConventionScan` is new.
Both `evidence_url` (flat) and `evidences[].url` are **derived in the DTO
mapper** (`helpers.ts#toConventionDto`/`blobUrl`) from `sha` + `line` — never
stored — so a repo rename or an owner transfer doesn't leave stale URLs
sitting in the database.

⚠️ Barrel-collision gotcha (`server/INSIGHTS.md`, 2026-09-21): before adding
any of these identifiers, the whole `contracts/` directory was grepped for
them — `ConventionCandidate` was the only pre-existing name, and it was being
*reshaped*, not duplicated.

## Schema (`db/schema/knowledge.ts`)

`conventions` was extended (not replaced) — it already existed as unused
scaffolding with `workspace_id`/`repo_id` and correct cascades. Added:
`category` (enum, default `'other'`), `scan_id` (→ `convention_scans`, `ON
DELETE SET NULL` — a candidate survives its scan row's own lifecycle),
`evidence_line`, `evidence_sha`, `evidences` (jsonb, the full array),
`status` (enum, default `'pending'`), `edited`, `created_at`, `updated_at`.
Dropped: `accepted` (superseded by `status`). Indexes: `(repo_id, status)`
(the list-query's exact filter shape) and `(scan_id)`.

`convention_scans` is new — `workspace_id`, `repo_id`, `status`
(`queued|running|done|failed`), `sha`, `provider`, `model`,
`candidates_proposed`, `candidates_verified`, `degraded`, `degraded_reason`,
`error`, `created_at`, `finished_at`, indexed on `(repo_id, created_at desc)`
(latest-scan lookup). This is what makes "model proposed 8, verification kept
3" and "Scanning repository…" observable across a page reload or an API
restart — nothing about scan progress lives only in memory.

Migration generated via `pnpm db:generate` (interactive rename-vs-create
prompts answered "create" for every new column, since none of them are a
rename of `accepted` — a `boolean` has nothing in common with the new `text`
enum columns); never hand-written, per root `AGENTS.md`.

## The extraction algorithm (job handler, not the HTTP handler)

`POST /repos/:id/conventions/extract` only resolves the clone (422 if
missing), inserts a `queued` scan row, and enqueues a job — the actual
sampling/LLM/verification work happens in `ConventionsService#runExtraction`,
registered as the `conventions-extract` job handler at plugin load
(`conventions/routes.ts`, mirroring `repo-intel/routes.ts:26-31`'s
`registerIndexJobHandlers` pattern). This is what makes the scan survive the
HTTP response closing and, combined with `convention_scans` being a real
table, survive an API restart mid-scan too (it will simply never finish and
stays `running` — the UI's `Re-scan` button lets a human retry).

1. **Sampling** (`sampler.ts`, no LLM): every filename in
   `constants.ts#CONFIG_FILE_CANDIDATES` that exists at the clone root, read
   verbatim (no glob resolution — simpler and sufficient for the well-known
   config filenames this targets), plus up to `SAMPLE_FILE_COUNT` (12) code
   files from `repoIntel.getTopFilesByRank` (over-fetched 6× then diversified
   to at most 2 files per top-level directory — `sampler.ts#diversifyByTopLevelDir`
   — so one hot module can't monopolize the sample). Every sampled file is
   clamped to `MAX_FILE_LINES` (400) and 1-based-line-numbered
   (`sampler.ts#numberLines`) before it reaches the prompt — this is what
   makes a cited `evidence.line` checkable at all.
2. **Model resolution**: `repository.ts#getConventionsModelOverride` (reads
   the workspace's `settings.feature_models.conventions` row directly — see
   "Why this isn't a container getter" below) falls back to
   `constants.ts#DEFAULT_CONVENTIONS_MODEL` (`openrouter` /
   `deepseek/deepseek-v4-flash`) when unset. This default is deliberately
   **not** `FEATURE_MODELS`' own registry default for `'conventions'`
   (`openai`/`gpt-5.4`) — the product decision is "a cheap OpenRouter model,
   overridable in Settings", and the registry's `gpt-5.4` default is a
   pre-existing placeholder from the unused scaffolding that this plan does
   not treat as authoritative.
3. **One `completeStructured` call** (`prompt.ts#buildExtractMessages` +
   `schemas.ts#ConventionExtraction`) — every sampled file's content is
   wrapped via `wrapUntrusted` (from `@devdigest/reviewer-core`, the same
   hardening a review diff gets), since it is repo-author-controlled text.
4. **Verification** (`helpers.ts#verifyEvidence`) against the sampled set —
   see the cross-package spec for the exact rejection rules.
5. **Merge** (`helpers.ts#dedupeCandidates`) by `(category, normalized rule)`;
   `confidence` = max of the merged set (independent sightings support a
   rule, they don't weaken it); capped to `MAX_CANDIDATES` (25) candidates ×
   `MAX_EVIDENCES_PER_CANDIDATE` (5) evidences.
6. **Persist** (`repository.ts#replacePendingCandidates`, one transaction):
   delete every `pending` row for the repo, insert the new merged set,
   leaving `accepted`/`rejected` rows untouched.
7. **Update the scan row** with final status/counts/degradation.

## Why the feature-model lookup isn't a container getter

`getFeatureModelOverride`/`resolveFeatureModel` (`modules/settings/feature-models.ts`)
take a `Container` and read `container.db` — a bare function import of them
from `conventions/service.ts` trips `no-cross-module-imports`
(`src/modules/<a>/` → `src/modules/<b>/`, even for a function, not just a
class). Wrapping it as a `Container` method was tried first and rejected: it
re-introduces the SAME edge one level up (`platform/container.ts` →
`modules/settings/feature-models.ts`) which, combined with
`feature-models.ts`'s existing `import type { Container }`, is a **circular**
import dependency-cruiser also flags (`no-circular`), even though the
`Container` import is type-only (`tsPreCompilationDeps: true` treats it as a
real edge — server/INSIGHTS.md's exact warning about type-only imports,
generalized to a mutual reference). The fix that satisfies both rules:
`conventions/repository.ts#getConventionsModelOverride` reads the shared
`settings` table directly via the Drizzle schema barrel — the same pattern
already used for `getLastIndexedSha` reading `repo_index_state` (owned by
`repo-intel`'s schema, not its module). Reading another module's TABLE via
the shared schema barrel is not a cross-module import of that module's code;
importing its repository CLASS or a bare function from its files is.

## Skill build (`POST /repos/:id/conventions/skill`)

Accepted-only (`status = 'accepted'`), rendered via
`helpers.ts#buildSkillMarkdown` (grouped by category, ≤3 evidence links per
rule), upserted **by name** (`CONVENTION_SKILL_NAME = 'repo-conventions'`)
within the workspace via `container.skillsRepo` — a new getter on
`platform/container.ts` mirroring `agentsRepo`/`reviewRepo`, added because
even an `import type` of `SkillsRepository` from `conventions/service.ts`
trips the same cross-module rule (server/INSIGHTS.md, 2026-09-21, records
this exact failure mode twice already). A workspace that scans more than one
repo shares this one skill — see the cross-package spec's non-goals.

`source: 'extracted'` — a new trusted skill source. `platform/prompt.ts`'s
`resolveSkillBodies` previously wrapped every non-`manual` skill in
`wrapUntrusted` before it reached a review; that would have neutered a
generated conventions skill during review (its own bullet points would show
up quoted inside an `<untrusted>` block instead of as direct instructions).
`source === 'extracted'` now passes through unwrapped, same as `manual` — its
body is DevDigest's own template over human-accepted, code-verified evidence,
not raw third-party text, so it earns the same trust. It is **not** written
as `source: 'manual'` — that would destroy the "extracted" provenance the
client's UI badge and this exact code path rely on.

With `agent_id`, linking uses `agentsRepo.linkSkill(agentId, skillId, order)` —
computed as "current link's order if already linked, else `links.length`"
(append) — never `agentsRepo.setSkills`, which replaces the agent's entire
skill set and would silently unlink everything else on that agent.

## Response-schema discipline

Every route declares an explicit `response:` schema
(`ConventionCandidate`/`ConventionScan`/`Skill`, all from
`@devdigest/shared`) mapped through a DTO helper
(`toConventionDto`/`toScanDto`) that never returns a raw Drizzle row —
`createdAt`/`updatedAt` (`Date`) are converted to ISO strings before the
handler returns, per the exact failure mode `server/INSIGHTS.md` (2026-09-21)
documents: the zod-fastify serializer runs `safeParse` on the in-memory
object BEFORE `JSON.stringify`, so a raw `Date` field 500s and an undeclared
field silently vanishes.

## Body-less request handling

`PATCH /conventions/:id` and `POST /repos/:id/conventions/skill` both accept
bodies whose every field is optional. Per `server/INSIGHTS.md` (2026-09-21):
a body-less `app.inject()` call (and a real empty POST with no
`Content-Type`) delivers `null`, not `undefined`, to `schema.body` — and
Zod's `.optional()` on every field does nothing for a `null` top-level value.
Both routes wrap their body schema in `z.preprocess((v) => v ?? {}, …)` rather
than relying on field-level `.optional()` alone.

## Tests

- `test/conventions-helpers.test.ts` (hermetic) — every verification
  rejection path, dedupe/merge, derived `evidence_url`, skill-markdown
  rendering, the sampler's pure pieces.
- `test/conventions-extract.it.test.ts` — happy path, every verification
  rejection via one scan, rerun-preserves-decisions, restart durability,
  exactly one LLM call.
- `test/conventions-degraded.it.test.ts` — no-clone 422 (no scan row
  created), zero-sample degrade (zero LLM calls), repo-intel-throws
  configs-only degrade (still one LLM call), LLM-throws failure (nothing
  persisted).
- `test/conventions-review.it.test.ts` — empty-state GET, list scoping,
  workspace isolation (404 across tenants), the `edited` flag rule (status-only
  PATCH leaves it `false`; rule/category PATCH sets it `true`).
- `test/conventions-skill.it.test.ts` — accepted-only rendering, upsert +
  version bump on rebuild, agent linking preserves the agent's other linked
  skills, workspace isolation.

All `.it.test.ts` files call `seed()` for their workspace row (never
hand-rolled with an arbitrary name — server/INSIGHTS.md's
`LocalNoAuthProvider` exact-name-match gotcha) and poll `convention_scans`
for a terminal status rather than assuming synchronous completion, mirroring
`test/helpers/runs.ts#waitForPrRuns`'s established pattern for this codebase's
fire-and-forget job model.
