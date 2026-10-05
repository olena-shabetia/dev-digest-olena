# Chat output and ledger format

## Chat output (always printed, every run)

```markdown
## Workflow retro — <workflow name or "ad hoc">
Scope: <what part of the conversation this covers>
Depth: in-context | deep

### Agent timeline
1. <subagent_type> — <one line: what it was asked, what it returned>
2. ...

### Cost (see reference/data-sources.md — no fabricated numbers)
- Agents launched: N (<model breakdown>)
- Re-runs / fix rounds: <count and why>
- Run metrics (table below), measured values only, `n/a` where not observable
- Session-wide token/cost figure, only if the host actually surfaced one

| Agent | Tokens | Cache-read | Tool calls | Duration |
|---|---|---|---|---|
| <subagent_type / unit> | <total_tokens> | <n or n/a> | <tool_uses> | <duration_ms → s> |
| **Total** | Σ | Σ | Σ | Σ agent-time; wall-clock <s or n/a> |

Parallelism: max <N> concurrent, <M> waves.

### Friction
- <what an agent struggled with, or where the orchestrator had to
  intervene/retry/re-explain — cite the agent and what happened>

### What worked
- <what went smoothly and is worth repeating as-is>

### Duplicated work
- <information re-fetched or re-derived by more than one agent that could
  have been handed down once — name the agents and the duplicated thing>

### Gaps & omissions
- <what no agent covered, a manifest that didn't say, a check the workflow
  skill calls for that didn't actually run>

### Recommendations
**For this workflow / its agents:**
- <concrete, e.g. "run-plan's fix-round prompt doesn't pass the failing
  file:line — the second implementer re-discovered it from scratch">

**For workflow-retro itself:**
- <concrete gaps in this skill's own method, e.g. "no way to tell whether
  two agents read the same file — would need X">
```

Print this in full even if some sections are thin — "none observed this run"
is a valid line, not a reason to omit the section.

## Ledger file — routing and format

One file per workflow, **modular by workflow slug**, not one giant log:

```
docs/retro/ledger/<workflow-slug>.md
```

- `run-plan` retros → `docs/retro/ledger/run-plan.md`
- `pr-self-review` retros → `docs/retro/ledger/pr-self-review.md`
- a code-review ultra pass → `docs/retro/ledger/code-review-ultra.md`
- anything not tied to a named skill → `docs/retro/ledger/ad-hoc.md`

Create the file (with the header below) the first time a workflow is
retro'd; append to it every time after.

### Shared trend ledger — `docs/retro/ledger.md`

Besides the per-workflow entry, every approved retro also appends **one table
row** to the shared `docs/retro/ledger.md`, so cost and parallelism can be
compared across runs and across workflows at a glance. Newest row last. Create
the file with this header the first time:

```markdown
# Retro trend ledger

One row per `workflow-retro` run, all workflows together. Append-only; the
narrative lives in `ledger/<workflow>.md`. `n/a` = not observable, never a guess.

| Date | Workflow | Agents | Tokens | Cache-read | Tool calls | Agent-time (s) | Parallelism | Fix rounds | Entry |
|---|---|---|---|---|---|---|---|---|---|
```

Row shape: `| YYYY-MM-DD | <workflow-slug> | N | Σ tokens | Σ cache-read or n/a |
Σ tool calls | Σ seconds | max N / M waves | <count> | [entry](ledger/<slug>.md) |`.
Compare against the previous row for the same workflow and, if tokens, tool
calls or fix rounds moved by more than ~25%, say so in the chat output's
recommendations. The row goes through the same propose-then-approve gate as
the entry (below) and the same append-only rule.

### File header (new files only)

```markdown
# Retro ledger — <workflow name>

Dated entries from `workflow-retro`. Append-only — see root AGENTS.md-style
rule: correct a wrong entry with a new dated entry that supersedes it, never
edit or delete an old one. Manual runs only; nothing here was auto-generated.
```

### Entry shape (newest first)

```markdown
### YYYY-MM-DD — <one-line characterization, e.g. "3-unit parallel run, one fix round">

**Agents:** N launched (<model breakdown>), order: <a> → <b> → <c>
**Cost:** <counts/ratios, per reference/data-sources.md — no invented numbers>
**Metrics:** tokens <Σ> · cache-read <Σ or n/a> · tool calls <Σ> · agent-time <Σ s> · parallelism <max N concurrent, M waves>

**Friction:** <1-4 bullets, actionable cold — see engineering-insights'
entry-quality bar: cite what happened concretely, not "agent X struggled">

**Worked well:** <1-3 bullets>

**Duplicated:** <1-3 bullets, or "none observed">

**Gaps:** <1-3 bullets, or "none observed">

**Recommendations:** <the two-bucket list from the chat output, condensed>
```

Reuse the same entry-quality bar as `INSIGHTS.md`
(`engineering-insights/reference/entry-quality.md`): every bullet must be
actionable cold, with a concrete cite (an agent name + what it returned, a
file:line, an exact retry count) — not a vague vibe like "communication could
be better."

## Propose-then-approve — the same gate as engineering-insights

**Never write the ledger entry unasked.** After printing the chat output
(which already contains everything the entry would say), show the exact
markdown block you'd append and which file it targets, then wait for the
user's go-ahead. "No" / "skip the ledger" is a first-class valid answer —
the chat output alone can be the whole deliverable for that run.

## Append-only rules

Same as `INSIGHTS.md`: never edit or reorder an existing entry or table row. To correct
one, append a new dated entry that says what was wrong and links back to the
entry it supersedes (`see YYYY-MM-DD above`).

## Promotion rule

If the same friction or gap shows up in three or more consecutive entries for
the same workflow, that's no longer a retro finding — it's a defect in the
workflow's skill. Say so explicitly in the chat output's recommendations and
point at the specific skill file/step to fix, rather than logging a fourth
near-identical entry.
