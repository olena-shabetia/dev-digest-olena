# specs/

Binding pre-code contracts, written before `implementation-planner` builds a
Development Plan. This file is wayfinding only — the actual rules live in
`AGENTS.md` (naming) and `.claude/agents/spec-creator.md` (spec content and
process); this README does not duplicate either and can go stale if it tries.

## Where a spec lives

Fixed by root `AGENTS.md`, not by this README:

- Cross-package spec: `specs/<lesson>-<slug>.md`
- Package-local refinement: `<pkg>/specs/<lesson>-<slug>.<api|ui>.md`
  (`client/specs/`, `server/specs/`, `reviewer-core/specs/`, `e2e/specs/`)

`e2e/specs/*.flow.json` is a different thing — numbered browser-flow
fixtures, not a spec; see `e2e/AGENTS.md`.

## Format

New specs are written by the `spec-creator` agent in **EARS format**: a
`Spec ID` / `Status` / `Supersedes` header, then `Problem and user` →
`Goals / Non-goals` → `User stories` → `Acceptance criteria (EARS)` (each
line tagged `[Ubiquitous|Event-driven|State-driven|Unwanted behavior|Optional
feature]`) → `Edge cases` → `Non-functional requirements` → `Inputs and
provenance` → `Untrusted inputs` → `Open questions`. Full schema, EARS
pattern table, and the design-analysis method: `.claude/agents/spec-creator.md`.

Specs written before this convention (e.g. `specs/L04-blast-radius.md`) stay
in their original shape — they are not being retrofitted. A spec superseding
one of them appends a dated "Superseded" callout at the old file's replaced
section instead of rewriting it; the old text stays as history.

## Who writes here

Only `spec-creator` creates or edits files in this tree (edits are limited
to appending a "Superseded" callout to an existing spec). `implementation-planner`
reads specs as input but never writes one — a missing spec is a
`### Recommendations` line in its plan pointing back here, not something it
drafts itself.
