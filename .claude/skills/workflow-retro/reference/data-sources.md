# Data sources — "in-context" vs. `--deep`

## Default: in-context only

Everything the orchestrator already has in its own conversation, with no
extra tool calls beyond what's needed to read what's already there:

- Every `Agent` tool call this session: `subagent_type`, `description`,
  `model` override (if any), `isolation`, and the text each agent returned.
- Every `SendMessage`/continuation exchange with an agent that was resumed
  rather than freshly spawned.
- The orchestrator's own turns: where it re-explained something, retried a
  call, corrected an agent's output itself instead of sending it back, or
  had to ask the user a clarifying question mid-workflow.
- Skill checklists that were followed (e.g. `run-plan`'s numbered steps) —
  useful for lining up "what the skill says should happen" against "what
  actually happened."

This is fast and free of extra tool calls. It is the right depth for "how did
that just go" asked right after a run.

### Run metrics — collect these for every agent

Each agent's completion notice (the `<usage>` block on its result) carries
three measured numbers. Copy them as printed, per agent:

| Metric | Where it comes from |
|---|---|
| `total_tokens` | completion notice `<usage>` |
| `tool_uses` (tool-call count) | completion notice `<usage>` |
| `duration_ms` (wall-clock) | completion notice `<usage>` |
| **Parallelism** | derived: the largest number of agents in flight at once (agents launched in the same turn / the same wave), plus the wave count. Count it from launch order, not from durations |
| **Cache-read tokens** | not in the notice — only from the on-disk transcripts, see `--deep` below |

Sum tokens, tool calls and agent-seconds across agents for the run row, and
report parallelism as `max N concurrent, M waves`. When an agent's notice has
no `<usage>` block, write `n/a` for that cell — never back-fill it.

### What in-context does NOT give you — say so, don't guess

- **Cache-read tokens** (see `--deep`) and any **session-wide** `/cost`-style
  figure unless the host actually printed one; if it did, label it
  session-wide, not per-agent.
- **Token figures are agent totals, not a cost.** Do not convert them to
  dollars; the model mix and cache split make that a guess.
- **A subagent's internal reasoning or intermediate tool calls.** Only its
  final returned report is visible. If a manifest says "fixed 3 of 4 files"
  without saying which one failed and why, that's a real gap to name in
  "Gaps & omissions," not something to reconstruct by guessing.

## `--deep`: add on-disk artifacts produced *during this session*

Only after the in-context pass, and only when asked (`/workflow-retro --deep`
or "do a deep retro"). Pull in whatever of these exist and are relevant to
the workflow being retro'd:

- **`git log` / `git diff` since session start** (or since the commit the
  session began from) — the ground truth for what actually changed, useful
  for catching an agent that under- or over-reported its own diff.
- **Plan/spec files the session read or wrote** (`plans/*.md`,
  `specs/**/*.md`) — compare the plan's stated work units against what
  `run-plan`'s agent timeline actually executed.
- **Gate/report JSON produced this session** (e.g.
  `.devdigest/review/last-report.json` from `pr-self-review`) — these
  already contain a structured, timestamped record; prefer them over
  re-deriving the same facts from prose.
- **Cache-read tokens, from the session transcripts.** The main session is
  `~/.claude/projects/<project-dir>/<session-id>.jsonl` and each subagent has
  its own `<session-id>/subagents/agent-<id>.jsonl`. Every assistant message
  there has a `usage` object; sum `cache_read_input_tokens` per file to get
  cache-read for that agent (and `input_tokens` / `cache_creation_input_tokens`
  / `output_tokens` if useful). This reads token *accounting* only — it is not
  license to quote an agent's reasoning. If the directory is missing or a
  subagent file can't be matched to an agent, write `n/a` for that cell.
- **`INSIGHTS.md` diffs from this session** — an entry appended during the
  session is itself a data point (a friction or a discovery worth noting in
  the retro too, cross-referenced rather than duplicated).

`--deep` is for token accounting, not for mining another agent's reasoning:
if a claim about *what an agent thought or why* needs its transcript to
settle, say the claim is unverifiable rather than inferring it.

## Reporting cost honestly

Never print a token number, dollar figure, duration, tool-call count or
cache-read figure you did not actually observe. Prefer:
- counts ("6 agent invocations: 4 Sonnet, 2 Opus")
- ratios ("the architecture-reviewer pass ran 3 times — once per fix round")
- explicit estimate flags ("~large session, rough order of magnitude only")

over a fabricated-precise number. A wrong-but-confident number is worse than
an honest "not measurable from here."
