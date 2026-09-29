---
name: workflow-retro
version: 1.0.0
type: Workflow
description: >-
  Retrospective over a just-finished multi-agent workflow (run-plan,
  pr-self-review, a code-review ultra pass, or any session that launched
  several subagents) — how many agents ran, in what order, how expensive the
  session was, what each agent found hard or easy, what got duplicated across
  agents, and what was skipped. Ends with recommendations for the reviewed
  workflow AND for this skill itself. Writes a chat summary plus a dated
  entry in docs/retro/ledger/<workflow>.md. MANUAL ONLY — never invoke this
  automatically at the end of another skill or workflow; it runs only when
  the user explicitly asks for a retro or invokes /workflow-retro.
---

# Workflow Retro

A retrospective on how a multi-agent session went, not on whether the
resulting code is correct — that's `pr-self-review` / `plan-verifier`'s job.
This skill looks at the *process*: agent count, order, cost, friction,
duplication, gaps — and turns that into (a) a ledger entry future sessions can
read before repeating the same workflow, and (b) concrete recommendations.

## Manual trigger only — read this before doing anything else

**This skill runs only when the user explicitly asks for it** — "run a retro
on that", "/workflow-retro", "how did that run go". No other skill in this
repo may invoke it automatically, and this skill must never propose adding
itself to another skill's workflow steps or to a hook. If you are here
because you are about to *finish* `run-plan`, `pr-self-review`, or any other
workflow and are wondering whether to chain into a retro next — the answer is
no, stop, report your result and end the turn. If a future edit to this file
or to another skill would make this fire automatically, that is a regression;
flag it rather than making the change.

## Scope — what session does it retro on

The **current conversation**, from its start (or from the point the user
specifies, e.g. "just the run-plan part") up to now. If the user names a
different session (a past one, or one running in another agent), say plainly
that this skill only has reliable access to the current conversation's
in-context history — see [reference/data-sources.md](reference/data-sources.md)
for exactly what "in-context" covers and what `--deep` adds on top.

## Workflow

Copy this checklist and tick off as you go:

```
- [ ] 1. Confirm scope: which part of the conversation is being retro'd, and
         name the workflow/skill it centers on (or "ad hoc" if none).
- [ ] 2. Reconstruct the agent timeline from in-context history: every Agent
         tool call, in order, with subagent_type, description, and a
         one-line take on its returned result.
- [ ] 3. Estimate cost: agent count, model per agent (from the agent
         definitions or overrides used), and rough token usage — see
         reference/data-sources.md for what's actually measurable vs.
         estimated, and always label estimates as estimates.
- [ ] 4. If `--deep` was passed: pull in the on-disk artifacts listed in
         reference/data-sources.md (plan files, gate JSON reports, git log/
         diff since session start) to verify or sharpen step 2–3, and to
         catch things the in-context summaries glossed over.
- [ ] 5. Extract friction, wins, duplication, and gaps from what the agents
         actually reported (their manifests/verdicts) and from where the
         orchestrator had to intervene, retry, or re-explain.
- [ ] 6. Draft recommendations in two buckets: (a) for the reviewed
         workflow/its agents, (b) for this workflow-retro skill itself, per
         reference/ledger-format.md's proposal rule.
- [ ] 7. Print the full retro to chat (reference/ledger-format.md, "Chat
         output" section).
- [ ] 8. Propose the ledger entry (reference/ledger-format.md) targeting
         docs/retro/ledger/<workflow-slug>.md. Wait for approval, same
         propose-then-approve gate as engineering-insights. Append only what
         is approved.
```

## What this is not

- Not a code review. It says nothing about correctness, architecture, or
  test coverage — that's `pr-self-review`, `architecture-reviewer`,
  `plan-verifier`.
- Not an `INSIGHTS.md` writer. `INSIGHTS.md` records engineering findings
  about the codebase; this skill records findings about *how the agents
  worked together*. A session can produce entries for both — write them
  separately, each to its own file.
- Not automatic. See "Manual trigger only" above — this is worth repeating
  because the natural place to reach for this skill is right after a
  workflow skill finishes, which is exactly the moment it must NOT fire on
  its own.

## Reference

- [reference/data-sources.md](reference/data-sources.md) — precisely what
  "in-context" gives you (and its blind spots), what `--deep` adds, and how
  to report token/cost numbers honestly instead of inventing precision.
- [reference/ledger-format.md](reference/ledger-format.md) — the chat output
  template, the ledger file format and routing (`docs/retro/ledger/<slug>.md`),
  append-only rules, and the two-bucket recommendation format.
