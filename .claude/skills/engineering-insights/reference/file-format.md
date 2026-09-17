# INSIGHTS.md format

## Header

Each `INSIGHTS.md` states its own scope. The root file has an extra clause:
package-local findings go in the package file, not root.

## The 7 sections, and which one a finding belongs in

```markdown
## What Works
## What Doesn't Work
## Codebase Patterns
## Tool & Library Notes
## Recurring Errors & Fixes
## Session Notes
## Open Questions
```

- **What Works** — an approach or config that succeeded, worth reusing as-is.
- **What Doesn't Work** — an antipattern or dead end. The section most often
  skipped and usually the most valuable one; don't shortchange it.
- **Codebase Patterns** — a convention or architectural decision specific to
  this repo (e.g. how a module is wired, why a boundary exists).
- **Tool & Library Notes** — a quirk of a dependency, package manager, or
  external tool.
- **Recurring Errors & Fixes** — a specific error a future session is likely to
  hit again, with its fix.
- **Session Notes** — dated, terse bullets that don't fit the categories above
  but are still worth a pointer (e.g. "explored X, ruled it out because Y").
- **Open Questions** — something left genuinely unresolved, for a future
  session to pick up.

## Entry shape

```markdown
### YYYY-MM-DD — lowercase one-line title

1–4 sentences, actionable cold, with `file:line` evidence in backticks.
```

**What Doesn't Work** and **Recurring Errors & Fixes** may use the four bolded
labels when a debugging narrative genuinely needs the structure:

```markdown
### YYYY-MM-DD — one-line title

**Symptom:** what you actually saw.
**Cause:** why it happened.
**Fix:** what resolved it, and what you verified afterwards.
**Rule:** how to avoid hitting it again.
```

Don't force this shape onto the other five sections — labelling a codebase
pattern "Symptom:" produces filler, not signal.

**Session Notes** is the one section that groups by date instead of by entry:

```markdown
### 2026-09-17
- terse bullet
- terse bullet
```

Newest entry first within each section. Empty sections keep their heading with
`_None yet._` underneath, so there is always an obvious place to append.
