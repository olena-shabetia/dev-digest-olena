# INSIGHTS — e2e

Append-only, newest entry first per section. See the `engineering-insights`
skill for the read/write/promotion contract.

---

## What Works

_None yet._

## What Doesn't Work

_None yet._

## Codebase Patterns

_None yet._

## Tool & Library Notes

### 2026-09-21 — `e2e/run.ts` has no way to run a single spec file

**Symptom:** validating one new `specs/*.flow.json` file means running the
entire suite — there's no CLI flag or env var to target a single file.

**Cause:** `e2e/run.ts` globs and runs every `specs/*.flow.json` in lexical
order, with no per-file filtering.

**Fix:** none needed for correctness — just budget for a full-suite run
(`../scripts/e2e.sh`) every time a flow file changes, even a one-line edit.

**Rule:** don't expect a fast inner loop for flow-file iteration in this
package; a full run is the only way to validate one file today.

## Recurring Errors & Fixes

_None yet._

## Session Notes

_None yet._

## Open Questions

_None yet._
