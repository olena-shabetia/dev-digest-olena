# frontend-ui-architecture — sources

Not loaded by the agent — this is the human-facing bibliography and version
log for the skill. See `SKILL.md` for the actual guidance.

## Version history

- **1.0.0** — 2026-09-21 — initial version. Scope: placement and
  organization only (where a file goes, who may import it, when to promote).
  Deliberately excludes React internals/hooks/state (owned by
  `react-best-practices`) and Next.js framework file conventions inside
  `app/` (owned by `next-best-practices`).

## How this skill was scoped

`react-best-practices` and `next-best-practices` already exist in this repo.
Before writing anything, both were read in full to find the overlap:
`react-best-practices`' organization guidance is a single 9-line "Code
Organization" section with no directory conventions, no barrel policy, and
no promotion rule; `next-best-practices` covers only what the framework
*forces* inside `app/` (special files, route groups, dynamic segments), not
where team code lives relative to it. This skill fills exactly that gap and
cross-links to both rather than restating them, per explicit instruction to
avoid duplication.

## Primary sources — framework & official

- [Next.js — Project structure and organization](https://nextjs.org/docs/app/getting-started/project-structure) — colocation, private folders (`_folder`), route groups, `src/` layout, the four organization strategies. Basis for the "route is the feature boundary" framing.
- [React — Server Components](https://react.dev/reference/rsc/server-components) — client-boundary composition ("donut pattern"), background for how the placement rules interact with `"use client"`.

## Architecture methodologies (compared, not adopted wholesale)

- [bulletproof-react — project-structure.md](https://github.com/alan2207/bulletproof-react/blob/master/docs/project-structure.md) — unidirectional import rule (shared → features → app) that this skill's "Import direction" section adapts to this repo's actual layers.
- [Feature-Sliced Design — Overview](https://feature-sliced.design/docs/get-started/overview) — layers/slices/segments model; "a layer may only import from layers strictly below" is the source of this skill's import-direction diagram.
- [Feature-Sliced Design — Next.js App Router guide](https://feature-sliced.design/blog/nextjs-app-router-guide) — how FSD maps onto App Router specifically.
- [Brad Frost — Atomic Design, ch. 2](https://atomicdesign.bradfrost.com/chapter-2/) — considered for the component-splitting section; not adopted as a taxonomy because this repo's actual split (route-local vs shared, not atoms/molecules/organisms) already matches its own promotion trigger better.
- [React Handbook — Project Standards](https://reacthandbook.dev/project-standards)
- [Robin Wieruch — React Folder Structure Best Practices](https://www.robinwieruch.de/react-folder-structure/)
- [Josh W. Comeau — Delightful React File/Directory Structure](https://www.joshwcomeau.com/react/file-structure/) — argues *against* feature-based structure because "categorization is really hard." Explicitly not followed here: App Router already hands you the feature boundary via the URL, which removes the exact problem Comeau is warning about.
- profy.dev — "Popular React Folder Structures and Screaming Architecture" — cited from search-result summary only; the source URL (`https://profy.dev/article/react-folder-structure`) did not resolve during research (DNS failure). Flagging rather than dropping since the summary's content (flat → grouped-by-type → feature-based progression) matches other sources; verify the live page before citing it further.

## Colocation & module boundaries

- [Kent C. Dodds — Colocation](https://kentcdodds.com/blog/colocation) — "place code as close to where it's relevant as possible," the underlying principle for every rule in `placement-map.md`.
- [Kent C. Dodds — State Colocation Will Make Your React App Faster](https://kentcdodds.com/blog/state-colocation-will-make-your-react-app-faster)
- [TkDodo — Please Stop Using Barrel Files](https://tkdodo.eu/blog/please-stop-using-barrel-files) — source of the barrel policy: index.ts as public-API boundary in app code, never imported from inside its own folder (circular-import risk).
- [ReactUse — Barrel Files: tree shaking, Next.js dev memory, tsc (2026)](https://reactuse.com/blog/barrel-files-tree-shaking/) — concrete cost data behind the same rule.

## Business logic placement

- [profy.dev — Clean(er) React Architecture pt. 6: Business Logic Separation](https://profy.dev/article/react-architecture-business-logic-and-dependency-injection) — informed the four-layer business-logic ladder (server → hooks → helpers → component body).
- [Felix Gerschau — Separation of concerns with React hooks](https://felixgerschau.com/react-hooks-separation-of-concerns/)
- [jsmanifest — React Server Components in 2026: Patterns, Pitfalls, and When to Actually Use Them](https://jsmanifest.com/react-server-components-patterns-pitfalls-2026)

## Skill authoring (how this skill itself was built)

- [Anthropic — Skill authoring best practices](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/best-practices) — SKILL.md under 500 lines, references one level deep, third-person trigger-rich description, concise-by-default. Followed directly: this SKILL.md is ~120 lines and every `reference/` file links only from SKILL.md, never from each other.
- [Anthropic — Agent Skills overview](https://platform.claude.com/docs/en/agents-and-tools/agent-skills/overview) — progressive disclosure model (metadata → SKILL.md → reference files).
- [Anthropic — The Complete Guide to Building Skills for Claude (PDF)](https://resources.anthropic.com/hubfs/The-Complete-Guide-to-Building-Skill-for-Claude.pdf)
- [Anthropic Engineering — Equipping agents for the real world with Agent Skills](https://www.anthropic.com/engineering/equipping-agents-for-the-real-world-with-agent-skills)

## Internal sources (this repo)

- `client/AGENTS.md` — feature-layout rule this skill expands into a full
  placement table.
- `client/docs/ui-architecture.md` — Server/Client Component boundary rules,
  deferred to rather than restated.
- `client/specs/pages.md` — route/data-contract table confirming which pages
  are client boundaries.
- `client/INSIGHTS.md` — source of the promotion rule (2026-09-18 entry) and
  the `SEV_COLOR` drift story (2026-09-18, Recurring Errors & Fixes) quoted
  in `reference/boundaries.md` and `reference/anti-patterns.md`.
- root `AGENTS.md` — naming conventions and the "do not touch" list
  (`skills-lock.json`, `*/src/vendor/**`).

## Known gaps found during research (out of scope for this skill, flagged for the maintainer)

- `.claude/skills/README.md` claims a `.cursor/skills → ../.claude/skills`
  symlink exists; it does not (`.cursor/` is absent from the repo root).
- `skills-lock.json` has drifted from disk: `architecture-patterns` and
  `github-workflow-automation` are locked with no corresponding skill
  folder; `mermaid-diagram`, `react-best-practices`, `react-testing-library`,
  and `security` are installed but not in the lockfile.
