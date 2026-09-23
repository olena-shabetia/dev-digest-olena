# L02 — Conventions Extractor (HW2)

Cross-package spec. Implementation plan: `plans/conventions-proud-pretzel.md`,
Wave 1. This file is the binding contract for the *shape* of the feature, per
root `AGENTS.md`'s "write the spec first" rule. Builds on `specs/L02-skills.md`
(same `Skill`/`SkillType`/`SkillSource` model) and the unused scaffolding this
plan wires up: the `conventions` table, the `ConventionCandidate` contract, the
`conventions` row in the feature-model registry, and
`repoIntel.getConventionSamples()`.

## Problem

A repo has house rules a reviewing agent should enforce — naming, structure,
error-handling, import/typing/async/styling/testing idioms — that live only in
the heads of its maintainers and in the pattern of the code itself. Writing
them down by hand is tedious and they drift from the actual code. The
Conventions Extractor scans a cloned repo, has a cheap LLM propose candidate
rules, **verifies every cited `file:line` against real code before a human
ever sees it**, and lets the human accept/reject/edit before the accepted set
becomes a `repo-conventions` skill linked to an agent.

## Scope

1. **Deterministic sampling** — no LLM involvement in *which* files are
   shown: config files read straight from the clone, plus up to 12 code files
   from `repoIntel.getConventionSamples`, diversified to at most 2 files per
   top-level directory so one hot module can't dominate the sample.
2. **One structured-output LLM call** proposing candidate rules, each citing
   exactly one sampled file + a 1-based line number.
3. **Code-side verification** — a candidate survives only if its cited path
   is in the sampled set, its cited line exists and is non-blank. The model's
   own quoted snippet is never trusted; the snippet shown to a human is
   always re-read from the file.
4. **Merge duplicates** — occurrences of the same rule (same category +
   normalized text) across multiple sampled files become ONE candidate with
   multiple evidences, not N near-identical cards.
5. **Human review lifecycle** — accept / reject / edit, restart-durable, a
   re-scan never discards a prior decision.
6. **Skill build** — accepted candidates only, rendered as markdown grouped by
   category, upserted as the `repo-conventions` skill (`type: 'convention'`,
   `source: 'extracted'`), optionally linked to an agent.

Explicitly **out of scope** for this plan wave: the client UI (`Wave 2`, a
separate spec — `client/specs/L02-conventions-extractor.ui.md`), the API
Contract Reviewer skills/plugin (`Wave 3`), and per-run attribution of which
convention fired on which review (same gap `specs/L02-skills.md` documents for
skills generally).

## The verification contract (the load-bearing decision)

The extractor's entire value proposition is that **every citation a human
sees was mechanically checked against the code**, not merely proposed by the
model. Concretely, a raw candidate `{category, rule, evidence: {file, line},
confidence}` becomes a `ConventionCandidate` only if:

1. `evidence.file`, normalized, equals one of the files the model was
   actually shown (the "sampled set" — never a file the model merely
   remembers or hallucinates).
2. `evidence.line` is a valid 1-based index into that file's (clamped) lines.
3. The cited line is non-blank.

Rejected candidates are silently dropped — not surfaced as "unverifiable"
cards, not retried. The verified snippet shown to the human (±2 lines of
context) is always re-read from the clone at verification time, never taken
from the model's own quoted text.

## The candidate lifecycle

```
 scan runs → candidates persisted as `status: 'pending'`
      │
      ├─ human PATCHes `status: 'accepted'` or `'rejected'`
      │
      └─ human PATCHes `rule`/`category` → `edited: true`, status unchanged
```

A **re-scan** (`POST /repos/:id/conventions/extract` again) replaces every
`pending` row for the repo with the newly verified set, but **never touches**
a row already `accepted` or `rejected` — a human decision is permanent unless
the human changes it again. This is what makes "re-scan after tweaking a
config" safe to do repeatedly during onboarding.

Duplicate rules are merged **before** persistence, not after: the unit a
human accepts/rejects is one candidate carrying up to 5 evidences (`also seen
in: …`), not one card per occurrence.

## Degradation (server/AGENTS.md: enrichment failures never crash a run)

- No clone yet → `422` up front, before a scan row is even created — no
  tokens spent proposing candidates against nothing.
- `repoIntel` disabled or throws, or no ranked files exist, but config files
  are present → the scan still runs (configs-only sample), marked
  `degraded: true` with a reason, and still makes exactly one LLM call.
- No samples at all (no configs, no ranked files) → scan `done`,
  `degraded: true`, **zero** LLM calls.
- The LLM call itself throws → scan `failed`, nothing is persisted to
  `conventions` for that run — a failed scan never partially overwrites a
  prior good one.

## The skill this feeds

Accepted candidates render into markdown grouped by category, each rule
carrying up to 3 evidence links, and upsert the `repo-conventions` skill:
`type: 'convention'`, `source: 'extracted'`. `source: 'extracted'` is a
**new**, third trusted source alongside `manual` (see
`specs/L02-skills.md`'s trust rule) — its body is DevDigest's own template
rendered over human-accepted, code-verified evidence from the user's own
repo, not third-party text, so `platform/prompt.ts#resolveSkillBodies` passes
it through unwrapped exactly like `manual`. Linking to an agent uses
`agentsRepo.linkSkill` (additive), never `setSkills` (which would unlink every
other skill on that agent).

## Non-goals

- No re-verification of an `accepted`/`rejected` candidate's evidence against
  a moved SHA — a decision is a decision until the human revisits it.
- No per-run attribution of which convention fired on which review (same gap
  `specs/L02-skills.md` documents).
- No multi-repo skill scoping — `repo-conventions` is upserted by name within
  a workspace; a workspace that scans more than one repo shares one skill
  (matches how Settings → Feature Models scopes the extraction model choice
  by workspace, not by repo).
