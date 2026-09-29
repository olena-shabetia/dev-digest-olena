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

### What in-context does NOT give you — say so, don't guess

- **Exact token counts per agent.** Subagent token usage is not surfaced to
  the orchestrator as a number. Report agent *count* and *relative* cost
  (e.g. "3 Sonnet agents + 1 Opus agent, the Opus one re-run twice") rather
  than inventing a token figure. If the host surfaces a `/cost`-style figure
  for the whole session, use that and label it as session-wide, not
  per-agent.
- **Wall-clock duration per agent**, unless timestamps were visible in the
  transcript (e.g. background-agent completion notifications). Don't
  fabricate durations.
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
- **`INSIGHTS.md` diffs from this session** — an entry appended during the
  session is itself a data point (a friction or a discovery worth noting in
  the retro too, cross-referenced rather than duplicated).

`--deep` does **not** mean reading another agent's raw internal transcript —
that is generally not accessible to the orchestrator at all, regardless of
depth. If a claim needs that kind of evidence to settle, say the claim is
unverifiable rather than fabricating a transcript read.

## Reporting cost honestly

Never print a token number, dollar figure, or duration you did not actually
observe. Prefer:
- counts ("6 agent invocations: 4 Sonnet, 2 Opus")
- ratios ("the architecture-reviewer pass ran 3 times — once per fix round")
- explicit estimate flags ("~large session, rough order of magnitude only")

over a fabricated-precise number. A wrong-but-confident number is worse than
an honest "not measurable from here."
