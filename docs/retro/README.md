# Workflow retro ledger

Dated retrospectives on multi-agent workflow *runs* (agent count/order, cost,
friction, duplication, gaps) — not on code. Written only by the
`workflow-retro` skill, and only when explicitly invoked; nothing here is
generated automatically.

`ledger.md` is the shared trend table (one row per run: tokens, cache-read,
tool calls, agent-time, parallelism) for comparing runs over time.

One file per workflow in `ledger/`, e.g. `ledger/run-plan.md`,
`ledger/pr-self-review.md`. Format and routing:
`.claude/skills/workflow-retro/reference/ledger-format.md`.
