---
name: pr-self-review
version: 1.0.0
description: >-
  Reviews all open local changes (committed on the branch, staged, unstaged,
  and untracked) before a pull request is opened — runs the deterministic
  gates (arch, vendor-sync, typecheck, lint), then routes the surviving files
  to the skills that actually govern them (frontend-ui-architecture and
  react-best-practices on UI files, onion-architecture and
  fastify-best-practices on backend files, etc.), and writes a verdict that a
  PreToolUse hook reads before allowing `git push`. Use before opening a PR,
  whenever the user asks to self-review, pre-review, or check their changes
  before pushing, and whenever `git push` is denied with a reference to this
  skill.
---

# PR Self Review

Runs a local pre-flight review over everything that would land in the next
PR, and blocks `git push` (via `.claude/hooks/review-gate.sh`) while a
CRITICAL finding is open. **State this plainly if asked:** this hook only
fires inside Claude Code — a push from a plain terminal, an IDE's git UI, or
`--no-verify` is not gated. Real enforcement for the team stays
`.github/workflows/repo-gates.yml`; this is a fast local pre-flight that stops
*this agent* from pushing known-broken work.

## Severity — reuse the product's own scale, don't invent one

DevDigest already ships a severity enum:
`Severity = z.enum(['CRITICAL','WARNING','SUGGESTION'])`
(`server/src/vendor/shared/contracts/findings.ts:11`), ordered by
`SEVERITY_ORDER` (`client/src/lib/severity.ts:10`). Emit exactly these three —
see [reference/severity.md](reference/severity.md) for the full rubric and the
mapping from each consulted skill's native output onto it. **Only CRITICAL
blocks the push.**

The load-bearing consequence: every CRITICAL except a `security` finding and a
`reviewer-core`-purity break is *machine-decidable* (a failing gate). Model
judgment can only raise a CRITICAL in those two narrow categories — this keeps
the push gate from being hostage to model variance. A gate that blocks on
taste gets disabled within a week, so nothing below SUGGESTION is ever
reported.

## Workflow

Copy this checklist and tick off as you go:

```
- [ ] 1. Collect the diff scope (handled by the gates script — no manual git needed)
- [ ] 2. Run ./scripts/pr-self-review-gates.sh; read its JSON
- [ ] 3. Any gate status "fail"? -> skip to step 8, verdict is "fail". Do NOT
         open any skill file — a Tier-1 failure is already a CRITICAL.
- [ ] 4. Apply the IGNORE list (reference/routing.md) to the file list
- [ ] 5. Route surviving files -> skills, via reference/routing.md.
         Group by package (server / client / reviewer-core / e2e), max 4
         skills per group. Dispatch one subagent per package (max 4 total)
         plus one dedicated security-taint pass (see routing.md) — never a
         subagent per skill or per file.
- [ ] 6. Grade every finding via reference/severity.md. Drop anything below
         SUGGESTION and anything without a file:line.
- [ ] 7. Apply pr-self-review.waivers.json: mark matching (file, rule) pairs
         non-blocking (with their reason shown), unless expired.
- [ ] 8. Write .devdigest/review/last-report.json and
         .devdigest/review/pr-body.md (reference/report-format.md)
- [ ] 9. Print the severity-grouped table, then the paste-ready PR-body block
```

**Step 3 is a hard short-circuit.** If any Tier 1 gate fails, write the report
and stop — do not spend tokens on an LLM review of code that does not
typecheck. If some gates are `skipped` (missing `node_modules`) but none
`fail`, continue to Tier 2 and mark the report `"completeness":"partial"`; a
skipped gate is a SUGGESTION, never a CRITICAL — a fresh clone must stay
pushable.

**Never run `pnpm install`** (local pnpm ≥12 fails with
`ERR_PNPM_IGNORED_BUILDS`; root `INSIGHTS.md`, 2026-09-21) and **never run
`pnpm run arch:baseline`** — it regenerates
`server/.dependency-cruiser-known-violations.json`, which would silently erase
every new architecture CRITICAL and turn a blocked push green. If a gate needs
`node_modules` that don't exist, report it `skipped` and tell the user to run
the install themselves.

## `--fix` mode

Invoked as `/pr-self-review --fix`. Runs only the mechanically-safe subset,
then re-runs the full workflow above:

| Fixable | Command |
|---|---|
| lint errors | `pnpm exec eslint --fix` (per touched package) |
| formatting | `pnpm format` / `npm run format` |
| vendor drift | `./scripts/check-vendor-sync.sh --write` |

- `check-vendor-sync.sh --write` does `rm -rf` on `client/src/vendor/shared`
  before recopying — its own header says *"Review the diff before
  committing."* Print the resulting `git diff` after running it; never apply
  it silently.
- Never auto-fix under `server/src/db/migrations/**`, `server/clones/**`, or
  any IGNORE path (reference/routing.md).
- Never auto-fix an LLM-sourced (Tier 2) finding — only gate output. Typecheck
  errors and `workspace_id` scoping stay manual.
- Never run `arch:baseline` as a "fix" — see above.

Report what remains, e.g. *"fixed 5 of 6; 1 CRITICAL left for you."*

## Reference

- [reference/routing.md](reference/routing.md) — the IGNORE list, the
  glob → skill routing table, and the `security` skill's stack-translation
  caveat (it's written for Express/Mongo; this repo is Fastify/Drizzle).
- [reference/severity.md](reference/severity.md) — the CRITICAL / WARNING /
  SUGGESTION rubric and the per-source mapping table, plus the spec-first
  check (`AGENTS.md`: "Building a lesson feature → write the spec first").
- [reference/report-format.md](reference/report-format.md) — the
  `last-report.json` schema, the `pr-self-review.waivers.json` schema, and the
  human-readable output format.
- `scripts/pr-self-review-gates.sh` — the Tier 1 runner this skill drives.
- `scripts/pr-self-review-lib.sh` — the shared fingerprint/diff-scope
  functions (also sourced by `.claude/hooks/review-gate.sh` — one
  implementation, so the skill and the hook can never disagree about what
  "fresh" means).
- `.claude/hooks/review-gate.sh` — the enforcement hook. Read it before
  changing the report schema; it depends on `schemaVersion`, `scope.fingerprint`,
  `verdict`, and `counts.critical`.
