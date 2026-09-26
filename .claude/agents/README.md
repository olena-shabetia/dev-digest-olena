# Agents

Claude Code subagents for this session — invoked via the Agent tool, not
loaded on-demand like `.claude/skills/`. Not to be confused with DevDigest's
own product agents (DB-backed reviewer prompts, see
`docs/agent-prompts/README.md`), which are a different thing with the same
name.

This file is a map of the set, not a copy of it — read the linked `.md` for
the full rules. When you add an agent, add a row here and a section below.

## Catalog

| Agent | Model | Tools | Purpose |
|-------|-------|-------|---------|
| [researcher](researcher.md) | sonnet | Read, Glob, Grep, Bash (read-only), WebSearch, WebFetch | Answers a specific question with cited evidence — repo or external — and reports what it could not find. |
| [planner](planner.md) | opus | Read, Glob, Grep, Bash (read-only), Skill, Write, Edit (writes confined to `plans/**`/`specs/**`) | Turns a feature request into a `plans/<slug>.md` Development Plan decomposed into parallel-safe work units. |
| [implementer](implementer.md) | sonnet | Read, Glob, Grep, Edit, Write, Bash, Skill, TodoWrite | Executes ONE work unit of an approved plan, in its own file lease. Launch several in parallel, one per unit per wave. |
| [test-writer](test-writer.md) | sonnet | Read, Glob, Grep, Edit, Write, Bash, TodoWrite | Writes tests for existing code, one package's own layout/naming/runner at a time, reusing existing mocks and helpers. |
| [architecture-reviewer](architecture-reviewer.md) | opus | Read, Glob, Grep, Bash (read-only) | Read-only review of architectural boundaries — backend rings, client placement, vendor-copy drift — with a severity-ranked, evidence-pinned report. |
| [plan-verifier](plan-verifier.md) | opus | Read, Glob, Grep, Bash (read-only) | Read-only check of finished code against a plan or spec, requirement by requirement, with a MET/PARTIAL/UNMET/CANNOT VERIFY table. |
| [doc-writer](doc-writer.md) | sonnet | Read, Glob, Grep, Bash (read-only), Write, Edit (writes confined to `docs/**`/`<pkg>/docs/**`) | Documents already-implemented functionality into the right `docs/` location, one Diataxis quadrant per document. |

All seven carry `disallowedTools: Agent` except `researcher` (which has no
`Agent` tool to begin with) — none fans out to further subagents.
`architecture-reviewer` and `plan-verifier` additionally deny
`Write`/`Edit`/`NotebookEdit` explicitly, on top of omitting them from
`tools` — belt and braces, since `disallowedTools` is applied first and
would survive even if `tools` were ever widened by mistake.

---

## researcher

**Responsibility.** Answers one concrete question with cited evidence, either
about this repo (`Mode: repo`) or external sources (`Mode: external`), or both
(`Mode: mixed`). Never mutates anything. If the question or its goal is
unclear, it returns up to 3 clarifying questions instead of guessing — that
*is* its report for that run, since it has no interactive channel mid-run.

**Permissions.** `Read, Glob, Grep, Bash, WebSearch, WebFetch`. No
`Write`/`Edit`/`NotebookEdit` — enforced by omission, not just requested.
`Bash` is inspection-only (`git log/blame/show/diff`, `rg`, `ls`, `jq`); never
`>`, `sed -i`, `rm`, `git add|commit|push`, or any install/build/test command.
Refuses `/deep-research` even if asked.

**Input.** A question, in a prompt string, plus an optional forced mode.

**Output.** A structured report to its final message: `Mode:` line, `##
Answer`, `## Confidence`, an `## Evidence` table with `file:line` citations or
dated URLs labelled primary/secondary, a mandatory `## Not found`, `##
Caveats`. Writes nothing to disk.

---

## planner

**Responsibility.** Reads a feature request plus this repo's `AGENTS.md`,
`INSIGHTS.md`, specs and code, then decomposes it into work units small enough
for several `implementer` instances to run **concurrently** without
colliding — each unit gets an exclusive file lease, and every symbol crossing
a unit boundary is frozen in writing before any unit starts. Never writes
feature code itself; if a self-check before writing fails (a shared path with
two owners, a migration split across units, more than one `client` unit per
wave), the plan is wrong, not the implementer.

**Permissions.** `Read, Glob, Grep, Bash (read-only), Skill, Write, Edit`.
Frontmatter can't scope `Write`/`Edit` by path, so the body enforces it: only
`plans/**`, `specs/**`, `<pkg>/specs/**`. `disallowedTools: Agent`. All 14
project skills preloaded via `skills:` (see "Skill loading in both agents"
below) — three of them (`security`, `pr-self-review`, `engineering-insights`)
are read for their knowledge only; the plan may never assign a unit to *run*
one.

**Input.** A feature request in the prompt (main-thread text, not a file
handoff — the plan doesn't exist yet).

**Output.** `plans/<lesson>-<slug>.md` (gitignored) with the fixed schema:
Context → Architecture decisions → **Contract freeze** (the load-bearing
section — shared contracts, HTTP surface, DB schema delta, i18n namespaces,
shared client components) → Serialization ledger → Work units → Execution
waves → Deferred verification → Abort/rollback → Open questions. Final message
is short: plan path, unit list, waves, any blocking open question.

**Sources these rules are based on** — established via the `researcher`
agent before this design was written, plus direct verification in this repo:

- [Claude Code — Subagents](https://code.claude.com/docs/en/sub-agents) —
  frontmatter fields (`skills:` preload semantics, `disallowedTools`), least
  privilege via tool omission, subagents inherit the `AGENTS.md`/`CLAUDE.md`
  hierarchy but not auto-memory or parent history, prompt-only handoff.
- [Claude Code Agent SDK — Subagents](https://code.claude.com/docs/en/agent-sdk/subagents) —
  subagents can spawn subagents up to depth 3 by default (hence
  `disallowedTools: Agent` here, deliberately), canonical least-privilege
  tool bundles.
- [Claude Code — Best practices](https://code.claude.com/docs/en/best-practices) —
  self-contained spec artifacts (name files/interfaces, state what's out of
  scope, end with an end-to-end verification step); reviewing a diff against
  a `PLAN.md` with a fresh-context agent rather than the author.
- [Anthropic — When to use multi-agent systems](https://claude.com/blog/building-multi-agent-systems-when-and-how-to-use-them) —
  the author shouldn't grade its own work; multi-agent runs cost 3–10× more
  tokens, so decomposition should earn its keep.
- [Anthropic — How we built our multi-agent research system](https://www.anthropic.com/engineering/multi-agent-research-system) —
  a delegation prompt needs an objective, output format, tool guidance, and
  task boundaries, or subagents duplicate work or leave gaps (source for why
  `Owned paths`/`Forbidden paths`/`Contract anchors` are separate fields, not
  prose).
- Repo-internal, read directly rather than cited externally: root/package
  `AGENTS.md` and `INSIGHTS.md` (pnpm 12 vs. CI's pinned pnpm 10;
  `reviewer-core` installs with `npm ci` only), `scripts/pr-self-review-gates.sh`
  (spec-first gate, exact gate commands), `server/.dependency-cruiser.cjs`
  (`no-unresolvable` is `severity: error` and blinds other rules —
  why `depcruise` is deferred, never per-unit), `scripts/check-vendor-sync.sh`
  (the `rm -rf` + `cp -R` window — why no client unit runs during a sync),
  `client/src/i18n/request.ts` (why per-namespace message files are
  parallel-safe by construction and need no serialization).

---

## implementer

**Responsibility.** Executes exactly one work unit from a plan `planner`
wrote. Stays inside that unit's file lease; treats anything outside it as
read-only and reports rather than reaches for it. Runs only the verification
its own package supports, scoped to its own paths — never a repo-wide gate,
never a review skill, never a git write. Reports a fixed-format manifest
rather than prose, so the parent (or the plan's next wave) can act on it
without re-reading the diff.

**Permissions.** `Read, Glob, Grep, Edit, Write, Bash, Skill, TodoWrite`.
`disallowedTools: Agent`. `git` restricted to read (`status/diff/log/show`) in
the body, since frontmatter can't express that. All 14 project skills
preloaded (see below); a hard routing table says which are *mandatory* per
unit target, on top of the full list. Never runs `depcruise`,
`check-vendor-sync.sh`, `.it.test.ts`/e2e/build, `/pr-self-review`, or
`engineering-insights` — all six are main-thread-only, after every unit lands.

**Input.** A prompt carrying the **plan's file path + a unit id** — never the
plan's prose inline, so the unit reads the frozen contract itself rather than
trusting a paraphrase.

**Output.** Code changes confined to the unit's `Owned paths`, plus a final
message in the fixed manifest format: `SKILLS LOADED`, `UNIT`, `STATUS`
(`complete`/`partial`/`blocked`/`failed`), `FILES`, `GATES` (real verdicts for
what it ran, `deferred` for what it didn't), `REGISTRATION REQUESTS` (lines
for shared files it isn't allowed to edit itself), `CONTRACT DEVIATIONS`,
`FOREIGN FAILURES`, `BLOCKERS`, `LEFT BEHIND` (partial/blocked only),
`INSIGHT CANDIDATES`. Never file contents or diffs in the message — the
working tree is the artifact.

**Sources these rules are based on** — the same base as `planner` (subagents
docs, agent-SDK subagents, best practices, the two Anthropic multi-agent posts
above), plus specifically:

- [Anthropic — When to use multi-agent systems](https://claude.com/blog/building-multi-agent-systems-when-and-how-to-use-them) —
  "the most significant failure mode for verification subagents is marking
  outputs as passing without thorough testing" → the `GATES` field must name a
  real verdict for every command actually run, `deferred` for the rest, never
  a `pass` for something unexecuted.
- Repo-internal, read directly: `server/pnpm-lock.yaml` /
  `client/pnpm-lock.yaml` / `reviewer-core/package-lock.json` /
  `e2e/package-lock.json` / `skills-lock.json` and root `AGENTS.md` ("Do not
  touch") for the no-install, no-lockfile-edit rule; `server/AGENTS.md` /
  `server/INSIGHTS.md` for the `container.<x>Repo` cross-module rule that
  makes arch compliance a write-time skill concern, not a per-unit gate;
  `server/package.json`'s `skip-worktree` bit (why `pnpm test:unit` isn't a
  real script — CI calls `vitest` directly); each package's `"lint": "eslint
  ."` script (why lint must be re-scoped to owned paths per unit, or it picks
  up a peer's half-written file); `.claude/hooks/review-gate.sh` (why `git
  push` is blocked regardless of what an implementer does, so it never needs
  to try).

---

## test-writer

**Responsibility.** Writes tests for code that already exists, across all
four packages, following each package's own layout, naming and runner rather
than a single house convention — `server/` unit tests are flat in
`server/test/`, `.it.test.ts` is a Docker/testcontainers switch not a style,
`client/` tests co-locate next to the component, `reviewer-core/` has its own
`test/` and reaches into `server/src/adapters/mocks.ts` across the package
boundary, and `e2e/` has no TypeScript tests at all — just numbered JSON
flows for Vercel's `agent-browser`. Never modifies the code under test; a bug
a test reveals gets reported, not fixed.

**Permissions.** `Read, Glob, Grep, Edit, Write, Bash, TodoWrite`.
`disallowedTools: Agent`. `git` restricted to read in the body (frontmatter
can't express that). Never runs `pnpm install`/`npm install`, touches a
lockfile, or runs `/pr-self-review`/`engineering-insights` — those are
main-thread-only, same as `implementer`.

**Input.** A package (inferred from paths if not stated) plus what to cover —
a path, a module, an endpoint, or a feature.

**Output.** New/changed test files inside the target package, plus a final
message: `PACKAGE`, `FILES`, `COMMAND RUN`, `RESULT` (real verdict for what
ran, `deferred` for what didn't), `COVERED`, `NOT COVERED` (mandatory,
`none` is the explicit empty value), `BUGS FOUND`, `NEEDS HUMAN
VERIFICATION`.

**Sources these rules are based on** — the same base as `implementer` (Claude
Code subagents docs, best practices, the two Anthropic multi-agent posts),
plus:

- [wshobson/agents — test-automator](https://raw.githubusercontent.com/wshobson/agents/main/plugins/backend-development/agents/test-automator.md) —
  detect the project's own framework/conventions before writing; cover
  happy/edge/error/boundary; the rule "tests validate existing code without
  changes" (source for "never modify the code under test").
- Repo-internal, read directly: `TESTING.md` (suite map, the "typological,
  not exhaustive" doctrine, the exact per-package commands);
  `server/test/helpers/{pg,runs,repo-intel-stub}.ts` and
  `server/src/adapters/mocks.ts` (the reuse inventory); `e2e/specs/*.flow.json`
  and `e2e/run.ts` (agent-browser step syntax, not Playwright).

---

## architecture-reviewer

**Responsibility.** Read-only review of architectural boundaries — backend
ring violations against `onion-architecture`, client placement/import
direction against `frontend-ui-architecture`, cross-package leaks, and
`server/src/vendor/shared` vs. `client/src/vendor/shared` drift. Runs
`pnpm arch:report` and `check-vendor-sync.sh` as evidence, never as its own
verdict-of-record — that's `/pr-self-review`'s job, gated by
`.claude/hooks/review-gate.sh`. Explicitly refuses to comment on style,
naming, or performance.

**Permissions.** `Read, Glob, Grep, Bash`. `disallowedTools: Agent, Write,
Edit, NotebookEdit` — `Write`/`Edit` are already absent from `tools`; the
`disallowedTools` entry is redundant on purpose. `Bash` is read-only by body
convention (same enforced-by-prose pattern as `researcher`): gate commands,
`git diff/log/show/status`, `rg`/`ls`/`jq`/`wc` only — never `arch:baseline`
(overwrites the baseline file), never `--write` on the vendor-sync script.

**Input.** A diff range or "review the current changes"; defaults to the
working tree if unspecified.

**Output.** A report only, no file changes: `Verdict:` line, a
`# | Severity | Rule | Location | Evidence | Fix` table, `## Gates run`
(real verdict per command), `## Not a finding`, `## Could not verify`
(mandatory), `## Caveats`.

**Sources these rules are based on** — the same base as `researcher`
(subagents docs, agent-SDK subagents, best practices), plus:

- [Claude Code — Subagents, available tools](https://code.claude.com/docs/en/sub-agents#available-tools) —
  `disallowedTools: Bash(git push *)`-style specifiers remove the *whole*
  tool, not one command; command-level Bash restriction inside frontmatter
  isn't supported, hence the read-only rule lives in the body, not the
  frontmatter.
- [Claude Code — Best practices](https://code.claude.com/docs/en/best-practices) —
  a reviewer's value is a fresh context that wasn't biased toward code it
  just wrote; and the explicit warning that a gap-hunting reviewer
  over-reports, hence "flag only what affects correctness/boundaries" here.
- Repo-internal, read directly: `server/.dependency-cruiser.cjs` and
  `server/.dependency-cruiser-known-violations.json` (`no-unresolvable` is
  `severity: error` and blinds other rules when it fires; the baseline spans
  `src` + `../reviewer-core/src` together, so the gate can't be scoped to one
  package); `server/package.json` (`arch`/`arch:report`/`arch:baseline`
  scripts — confirmed `arch`/`arch:report` are already covered by
  `.claude/settings.json`'s `Bash(cd * && pnpm arch*)` allowlist entry, no
  settings change needed); `scripts/check-vendor-sync.sh` (`--write` performs
  a one-way copy — never run it from this agent).

---

## plan-verifier

**Responsibility.** Checks finished code against a plan or spec, requirement
by requirement — never a substitute for `architecture-reviewer` or
`/pr-self-review`, and never grading code quality. Extracts every numbered
requirement from a plan's `Acceptance criteria`/`Work units`/`Contract
freeze` sections (or a spec's `Scope — N surfaces`), traces each to
`file:line` evidence, and reports a fixed four-way verdict per requirement
plus anything built outside the plan's stated scope.

**Permissions.** `Read, Glob, Grep, Bash`. `disallowedTools: Agent, Write,
Edit, NotebookEdit` — the same read-only Bash convention as
`architecture-reviewer`. The three preloaded skills
(`onion-architecture`, `frontend-ui-architecture`, `zod`) are knowledge only,
never a grading rubric — a finding whose only basis is a skill convention is
out of scope here.

**Input.** A **path** to a plan (`plans/<slug>.md`) or spec
(`specs/<lesson>-<slug>.md`, `<pkg>/specs/*.md`), never a paraphrase — the
unit reads the frozen requirements itself. No interactive channel: a missing
path is the entire report for that run.

**Output.** A report only: `Plan:`, `Verdict:`, a
`MET n · PARTIAL n · UNMET n · CANNOT VERIFY n` count line (must sum to the
requirement count — a mismatch means a lost requirement), a numbered
`# | Requirement | Verdict | Evidence` table covering every requirement
including every `MET`, `## Gaps`, `## Out-of-plan changes`, `## Non-goals
violated`, an optional `## Notes`.

**Sources these rules are based on** — the same base as `researcher`
(subagents docs, agent-SDK subagents, best practices), plus:

- [Claude Code — Best practices](https://code.claude.com/docs/en/best-practices) —
  the verbatim verification template this agent implements: "review the diff
  against PLAN.md. Check that every requirement is implemented… and nothing
  outside the task's scope changed. Report gaps, not style preferences."
- [phxagents — requirements-verifier](https://phxagents.dev/agents/requirements-verifier/) —
  the MET/PARTIAL/UNMET/UNCLEAR verdict shape and "commit messages alone
  don't count" as the source for requiring opened `file:line` evidence.
- [agentskill.sh — spec-driven](https://agentskill.sh/plugins/uta2000/spec-driven) —
  the `[MANUAL]`-prefixed "cannot verify" escape hatch, so ambiguity is
  reported rather than resolved by guessing.
- Repo-internal, read directly: `plans/researcher-ticklish-peacock.md` and
  `implementer.md`'s `Contract anchors`/`Owned paths` fields (the section
  headings this agent's extraction order is built to recognize).

---

## doc-writer

**Responsibility.** Documents functionality that is already implemented —
turns finished code, a plan, or a spec into a document under `docs/` or
`<package>/docs/`, choosing the destination from this repo's own routing
(one architecture doc per package plus `docs/agent-prompts/` at the root) and
one Diátaxis quadrant per document, with Mermaid diagrams where a relation
is easier shown than described. Extending an existing doc beats creating a
new one. Never documents a plan's unbuilt portion as if it shipped.

**Permissions.** `Read, Glob, Grep, Bash (read-only), Write, Edit`.
`disallowedTools: Agent`. Frontmatter can't scope `Write` by path, so the
body enforces it: only `docs/**` and `<pkg>/docs/**` — everywhere else
(`specs/**`, any `INSIGHTS.md`, `AGENTS.md`/the `CLAUDE.md` symlink,
`plans/**`, any `README.md`, `skill-library/**`, `.claude/**`) already has an
owner and is explicitly off-limits.

**Input.** A feature, plan path, or spec path to document, plus optionally
which package/topic it belongs to.

**Output.** New or extended files under `docs/**`/`<pkg>/docs/**`, plus a
final message: `WROTE` (paths, each marked created/extended), `QUADRANT`,
`SOURCES` (verified `file:line` citations), `DIAGRAMS`, `NOT DOCUMENTED`
(mandatory, `none` is the explicit empty value), `CONTRADICTIONS FOUND`.

**Sources these rules are based on** — the same base as `implementer`
(subagents docs, best practices), plus:

- [Diátaxis](https://diataxis.fr/) — the four-quadrant classification
  (tutorial/how-to/reference/explanation) and the rule to keep quadrants
  unmixed within one document.
- [wshobson/agents — docs-architect](https://raw.githubusercontent.com/wshobson/agents/main/plugins/code-documentation/agents/docs-architect.md) —
  cross-referencing code with `file_path:line_number` notation.
- Repo-internal, read directly: this repo's own `docs/` tree (only
  `docs/agent-prompts/` at the root; exactly one architecture doc per
  package — `server/docs/architecture.md`, `client/docs/ui-architecture.md`,
  `reviewer-core/docs/pipeline.md`, `e2e/docs/coverage-plan.md` — the source
  for the destination-routing table); `AGENTS.md`'s note that `CLAUDE.md` is
  a symlink and Edit tools refuse to write through one; existing Mermaid
  usage in `README.md` (root and per-package) and
  `server/src/modules/repo-intel/README.md`.

---

## Skill loading across the agents

`planner` and `implementer` preload all 14 project skills via `skills:` in
frontmatter — each skill's SKILL.md is injected in full at startup, on every
run, whether or not that run's unit needs most of them. That's the right
call for those two: either one can touch any package, so a routing table
inside the body decides which preloaded skill is mandatory for which unit
target, and three of the fourteen (`security`, `pr-self-review`,
`engineering-insights`) are preloaded as *knowledge* only, never invoked as
*actions* by either agent.

The four agents added after them are narrower by design, so each preloads
only what actually governs its domain instead of the full fourteen:

| Agent | Skills preloaded | Why this set |
|---|---|---|
| `test-writer` | `react-testing-library`, `react-best-practices`, `next-best-practices`, `fastify-best-practices`, `drizzle-orm-patterns`, `zod`, `typescript-expert` | everything a test might need to exercise, across all four packages, minus anything architecture- or docs-specific |
| `architecture-reviewer` | `onion-architecture`, `frontend-ui-architecture`, `next-best-practices`, `react-best-practices`, `typescript-expert` | the two boundary skills plus enough frontend/backend context to recognize a violation in situ |
| `plan-verifier` | `onion-architecture`, `frontend-ui-architecture`, `zod` | knowledge only, to recognize *where* a requirement should have landed — never a grading rubric, so the review-only skills (`security`, `pr-self-review`) are deliberately left out |
| `doc-writer` | `mermaid-diagram`, `onion-architecture`, `frontend-ui-architecture`, `typescript-expert` | diagram syntax plus enough structural knowledge to describe a module correctly |

This is the same trade-off the original version of this section flagged as
worth revisiting for `planner`/`implementer`: profiling the preload list to
what an agent's job actually needs shrinks startup cost without losing
anything the agent is allowed to do with the rest.
