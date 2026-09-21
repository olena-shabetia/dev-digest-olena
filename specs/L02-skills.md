# L02 — Skills

Cross-package spec. Implementation plan: see PR description / commit history
around this spec's introduction; this file is the binding contract for the
*shape* of the feature, per root `AGENTS.md`'s "write the spec first" rule.

## Problem

DevDigest agents today are a single `system_prompt` blob. Every reusable
review rule (a severity rubric, a convention, a security gate) has to be
copy-pasted into each agent that needs it, and there is no way to see which
rules actually went into a given run's prompt.

## Scope — four surfaces

1. **The `skills` resource** — named, reusable markdown blocks, stored once,
   editable in the UI, versioned like agents.
2. **Attaching skills to an agent, in order** — an explicit `agent_skills`
   ordering that determines where each skill's body lands in the assembled
   prompt.
3. **Rendering skills into a run** — the review server resolves an agent's
   enabled linked skills to bodies and passes them into `reviewPullRequest`,
   which renders one `## Skills / rules` section.
4. **Importing a skill from a file** — a two-step preview-then-save flow for
   `.md`/`.zip` uploads.

Explicitly **out of scope**: the URL and community import tabs (`skills.json`'s
`url.*`/`community.*` keys stay unused), skill evals (`eval_cases.owner_kind =
'skill'` exists but the eval pipeline is L06), and the Conventions extractor
(the other half of README's L02 line item).

## What a Skill is

A `Skill` is **text only** — it carries no code, no tools, and no execution of
any kind. The only thing the product ever does with a skill body is
concatenate it into a prompt. Its fields:

- `name`, `description` — the description doubles as the interface: it is
  written as an instruction to the reviewing agent, not documentation about
  the skill.
- `type` (`SkillType`) — a classification (e.g. `rubric`, `convention`,
  `custom`), not a behavior switch.
- `source` (`SkillSource`) — `manual | imported_url | community`; drives the
  trust rule below.
- `body` — the markdown text rendered into the prompt.
- `enabled` — whether an agent link to this skill can currently reach a
  prompt.
- `version` — bumped only when `body` changes; see
  `server/specs/L02-skills.api.md` for the versioning rule.

## The trust rule (the load-bearing decision)

Trust follows `skills.source`, and the wrapping happens **server-side**, in
the `skills` module — never inside `reviewer-core`:

- `source: 'manual'` (authored in the product) → the body is passed through to
  `reviewPullRequest` as-is, raw.
- `source: 'imported_url' | 'community'` (someone else's instructions) → the
  body is wrapped with `wrapUntrusted('skill:<name>', body)` before it reaches
  `reviewPullRequest`. `wrapUntrusted` is already re-exported from
  `server/src/platform/prompt.ts`.
- An imported skill is created with `enabled: false`. It cannot reach a
  prompt until a human reviews it and flips it on.

Why server-side, not in `reviewer-core`: `reviewer-core` must stay a pure
engine that receives already-resolved bodies (`reviewer-core/src/review/run.ts`
takes "resolved skill bodies, NOT slugs"). Which sources are trusted is a
product policy, decided by the module that reads the DB — not an engine
concern. This also keeps `reviewer-core`'s invariant list untouched.

## The byte-identical-prompt invariant

An agent with **zero enabled linked skills** must produce a prompt identical
to today's, before this feature existed. This is satisfied by the existing
omit-when-empty contract on `reviewPullRequest`: `skills` is passed only when
the resolved array is non-empty —

```ts
...(skillBodies.length ? { skills: skillBodies } : {}),
```

Nothing is ever passed as `skills: []`; the key is omitted entirely. A run for
an agent with skills disabled (or none linked) must be indistinguishable, at
the prompt level, from a run before this feature shipped.

## Ordering semantics

Skills render in `agent_skills.order` ascending — earlier order means earlier
placement in the assembled `## Skills / rules` section of the prompt. Order is
set explicitly by the client (`POST /agents/:id/skills { skill_ids: [...] }`,
the array's index becomes each link's `order`); there is no implicit
alphabetical or creation-time ordering anywhere in the resolution path.

## The two-step import contract

Import is **preview, then save** — nothing is written to the database until a
human confirms:

1. `POST /skills/import/preview` accepts one `.md`/`.zip` file and returns a
   `SkillImportPreview` (`name`, `description`, `type`, `body`,
   `source_filename`, `ignored_entries`, `executable_entries`). This call
   writes nothing.
2. The client then calls `POST /skills` with the previewed fields plus
   `source: 'imported_url'` and `enabled: false` to actually persist the
   skill.

See `server/specs/L02-skills.api.md` for the archive-handling policy behind
step 1.

## Non-goals

- No execution of any part of a skill or an archive, ever — a skill is text
  concatenated into a prompt, never code that runs.
- No URL or community catalog import (the tabs and their i18n keys stay
  unused).
- No skill evals (`EvalsTab` is a placeholder; L06 territory).
- No Conventions extractor.
- No per-skill run attribution — nothing records which skill fired on a given
  run; see `server/specs/L02-skills.api.md` for what that cuts from the Stats
  tabs.
