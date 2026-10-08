# Spec: Eval Pipeline — client refinement
Spec ID: SPEC-13
Status: draft
Supersedes: none

Refines `specs/L06-eval-pipeline.md` (SPEC-11) for `client/`. SPEC-11 owns
scope, scoring and the decisions (Q1–Q14, N1–N5). This file adds UI detail
and must not contradict it.

Criteria tagged *(spec-defined, no design image)* describe a state that none
of the six images shows. Their presentation was drafted here and accepted by
the user (SPEC-11 Decisions, N3); they are binding like any other criterion. Criteria here are numbered
`U-n`; "criterion n" without a prefix means SPEC-11.

Component names (the course calls the modal `EvalCaseModal`), folder names,
hook names and route segments are `implementation-planner`'s to freeze.
Placement rules come from `client/AGENTS.md` and the
`frontend-ui-architecture` skill.

## Problem and user

**INSIGHTS entries that apply:**

- `client/INSIGHTS.md` 2026-09-18, "promote on second consumer" — the case
  modal is opened from the PR page (new draft) and from the Agent editor's
  Evals tab (edit). Two routes in the same change, so it starts in
  `src/components/`. The metric cards are used by the Evals tab and the
  dashboard agent page: same rule.
- `client/INSIGHTS.md` 2026-09-22, "pre-translated, never a literal" — the
  new button sits in the shared `FindingCard`, also rendered by the diff
  viewer.
- `client/INSIGHTS.md` 2026-09-18, "`{count}` does not format numbers" —
  percentages, deltas, cost, duration.
- `client/INSIGHTS.md` 2026-09-27, "two keys rendering identical text" — a
  metric value appears in a card and in a row on the same screen; "passed"
  appears in the modal strip and in the case row behind it.
- `client/INSIGHTS.md` 2026-09-18, "hand-rolled severity color map" — case
  rows and draft-run findings use `SeverityBadge`.
- `client/INSIGHTS.md` 2026-09-18, "a count badge must be derived at the
  same pipeline stage" — "N passing" and "2 selected".
- `client/INSIGHTS.md` 2026-09-21, `exhaustive-deps` — the "result is stale"
  flag (U-17) derives from draft content; compute it from the content, not
  from a separately tracked effect.
- `client/INSIGHTS.md` 2026-09-17, vendor drift (superseded: in sync). Rule
  still binding: change the server contracts first, then sync.

**Design input:** `specs/assets/L06-eval-pipeline/1.png` … `6.png`, described
in SPEC-11.

**What exists (verified):**

- `FindingCard` with Accept and Dismiss only
  (`src/components/finding-card/FindingCard.tsx:91-112`); three consumers
  (`FindingsPanel.tsx:120`, `diff-viewer/CodeLine/CodeLine.tsx:111`,
  `diff-viewer/OutdatedFindings/OutdatedFindings.tsx:30`).
- Agent editor tabs config / skills / context
  (`src/app/agents/[id]/_components/AgentEditor/constants.ts:15-19`); tab
  state in `?tab=` validated against `VALID_TABS`
  (`src/app/agents/[id]/page.tsx:15,28`). No Evals tab component.
- No `src/app/eval/` route. `activeKeyFor` already maps `/eval` to `eval`
  (`src/components/app-shell/helpers.ts:35`).
- Copy: `messages/en/eval.json`. Its `caseEditor` namespace already holds
  most modal copy: `caseTitle`, `nameLabel`, `inputLabel`, `tabs.diff`,
  `tabs.prMeta`, `titleLabel`, `bodyLabel`, `expectedOutput`, `validJson`,
  `invalidJson`, `runCase`, `running`, `save`, `saving`, `lastRunPassed`,
  `lastRunFailed`, `resultSummary`. It has no key for a Files tab, an
  expectation type, a stale result, a timeout, or the discard confirmation.
- Primitives in `@devdigest/ui`: `Modal`, `Tabs`, `TextInput`, `Textarea`,
  `FormField`, `Checkbox`, `MetricCard`, `EmptyState`, `ErrorState`,
  `Skeleton`, `ProgressBar`, `SeverityBadge`
  (`src/vendor/ui/{charts,kit,primitives}/`). No code or JSON editor
  primitive exists in the barrel.
- The skill editor's `EvalsTab` is a placeholder and stays one.

## Goals / Non-goals

**Goals:**

- "Turn into eval case" in `FindingCard`, opening the case modal (`1.png`).
- The case modal (`6.png`): name, Diff tab (editable), PR meta tab
  (read-only), expectation type and the finding's severity, category and
  title (read-only reference), expected output limited to file, start line
  and end line (editable, validated), Run case, result strip, Save, Cancel, discard confirmation.
- Evals tab in the Agent editor: metric cards, pass count, case list with
  edit and delete, "Run all evals", "View full dashboard →" (`5.png`).
- `/eval` dashboard index (`2.png`).
- Dashboard agent page: metric cards with delta, runs table with selection,
  "Run eval", Compare (`3.png`) — the only place run history lives.
- Compare modal (`4.png`).
- Sidebar entry.

**Non-goals:** SPEC-11's out-of-scope table. These visible design elements
are **not rendered**, rather than rendered disabled: "New eval case",
"Finding skeleton", "Run on save", the "Files" tab, the per-row run icon,
"Promote v7", "Run all agents", "30 days", the warning banner, the agent
switcher, the trend chart and sparklines, the Stats and CI tabs, "Learn",
"Reply to author". The Skill editor's Evals tab is not built (optional
bonus).

## User stories

As in SPEC-11. Two additions from the designs: from the Evals tab I jump to
the same agent's dashboard page ("View full dashboard →"); from a case row I
reopen the case in the modal.

## Acceptance criteria (EARS)

### "Turn into eval case" (criteria 1–3, 6–10)

- U-1. [State-driven] WHILE a finding card is expanded, the system shall show
  a "Turn into eval case" action after Accept and Dismiss.
- U-2. [State-driven] WHILE the finding is neither accepted nor dismissed,
  the system shall render the action disabled with a hint that a decision is
  needed first.
- U-2a. [Event-driven] WHEN the user accepts or dismisses a finding, the
  system shall enable the action on that card as soon as the decision is
  recorded, without a page reload, in every place the card is rendered.
- U-2b. [Unwanted behavior] IF a finding's decision is cleared, THEN the
  system shall disable the action on that card again, with the U-2 hint,
  without a page reload. No clear-decision action exists in the product today
  (SPEC-11 criterion 1b); the action's enabled state shall be derived from
  the finding's current `accepted_at` / `dismissed_at`, not held separately,
  so this holds if one is added.
- U-3. [Event-driven] WHEN the user activates the action, the system shall
  request the draft for that finding and open the case modal with it.
- U-4. [State-driven] WHILE the draft is loading, the system shall show the
  modal in a loading state and keep its actions unavailable.
- U-5. [Unwanted behavior] IF the draft request is refused, THEN the system
  shall show the reason — outdated finding, missing agent, no decision, not
  found — and offer nothing to save.
- U-6. [Event-driven] WHEN the draft response is an existing case, the system
  shall open the modal in edit mode on that case and say that the finding is
  already in the set.
- U-7. [Ubiquitous] The system shall take every label of the action from
  `next-intl`, including when the card is rendered inside the diff viewer.

### The case modal (criteria 11–16)

- U-8. [Ubiquitous] The system shall title the modal with the case name and
  show the owning agent's name beneath it.
- U-9. [Ubiquitous] The system shall show the expectation type as a
  read-only label that names it in words ("must find" / "must not flag").
- U-9a. [Ubiquitous] The system shall place that label next to the "Expected
  output" heading in the modal *(spec-defined, no design image)*.
- U-10. [Ubiquitous] The system shall offer two input tabs: Diff, an editable
  monospace text area holding the diff; and PR meta, showing the pull request
  number, title and body read-only.
- U-11. [Ubiquitous] The system shall show the expected output as editable
  JSON text holding one object with exactly three keys — `file`, `start_line`
  and `end_line` — in the "Expected output" panel where `6.png` has its JSON
  editor and "valid JSON" badge.
- U-11a. [Ubiquitous] The system shall show the finding's severity, category
  and title as one read-only reference line directly above that editable
  text, next to the expectation type label, and shall not include them in
  the editable text, in any request, in the unsaved-changes check or in the
  out-of-date check *(spec-defined: `6.png` shows severity, category and
  title inside the editable JSON; the user decided they are reference
  information only)*.
- U-12. [State-driven] WHILE the expected output parses as JSON and passes
  the client-side checks — one object, only the keys `file`, `start_line`
  and `end_line`, a non-empty file, positive integer lines with start not
  after end — the system shall show the "valid" badge.
- U-13. [State-driven] WHILE the expected output fails those checks, the
  system shall show the "invalid" badge with the failing reason and render
  Run case and Save disabled.
- U-13a. [State-driven] WHILE a draft flagged by the server as needing its
  expectation moved (criterion 8a) still has the expectation lines it opened
  with, the system shall show the invalid badge with a hint to move the
  expectation onto a changed line of the diff, and render Run case and Save
  disabled *(spec-defined, no design image)*.
- U-14. [State-driven] WHILE the name is empty, the system shall render Save
  disabled and mark the name field as required.
- U-15. [Unwanted behavior] IF the server rejects a draft run or a save for a
  malformed diff or expectation, THEN the system shall show the server's
  reason next to the field it names and keep the draft content.

### Run case (criteria 17–22)

- U-16. [Event-driven] WHEN the user activates Run case, the system shall
  send the draft's current diff and the expectation's file, start line and
  end line with the finding id or case id, and nothing else.
- U-16a. [State-driven] WHILE the draft run is pending, the system shall show
  a spinner and "Running…" on Run case, render Run case and Save disabled,
  and keep the fields editable *(spec-defined, no design image)*.
- U-16b. [Event-driven] WHEN the draft run returns, the system shall show the
  result strip — passed or failed, matched against expected, duration, cost —
  and, under the strip in the right column and scrolling with it, list the
  surviving findings with file, lines, severity and title, each marked
  matched or not *(the list is spec-defined, no design image)*.
- U-16c. [Unwanted behavior] IF the returned cost is null, THEN the system
  shall show the cost as unknown, never as zero.
- U-16d. [Unwanted behavior] IF the draft run fails or times out, THEN the
  system shall replace the result strip with an error strip of the same size
  showing the reason, keep the draft content, and re-enable Run case
  *(spec-defined, no design image)*.
- U-17. [State-driven] WHILE the diff or the expectation's file, start line
  or end line differs from the content the last draft run used, the system shall dim the result strip and
  add the text "edited since this run" *(spec-defined, no design image)*.
- U-17a. [Ubiquitous] The system shall state on or beside Run case that it
  calls the model and costs money.

### Save, cancel, close (criteria 23–30)

- U-18. [State-driven] WHILE no draft-run result exists for the current diff
  and expectation, the system shall render Save disabled with a hint to run
  the case first. The gate is client-side only.
- U-18a. [Unwanted behavior] IF the user activates Save while the current
  result is a fail, THEN the system shall ask "save a failing case?" and save
  only on confirmation.
- U-19. [Event-driven] WHEN a save succeeds, the system shall close the
  modal, confirm with the case name, expectation type and agent, and refresh
  that agent's case list.
- U-18b. [Event-driven] WHEN the user saves a new case, the system shall send
  the finding id, the name, the diff, the expectation's file, start line and
  end line, and the expectation type the modal displayed — the last only so
  the server can detect a changed decision, never as an input.
- U-19a. [Unwanted behavior] IF a save is rejected because the decision
  changed or a case already exists, THEN the system shall show that reason
  and keep the modal open with its content.
- U-19b. [State-driven] WHILE a save is pending, the system shall render
  Save, Run case and Cancel disabled.
- U-20. [Event-driven] WHEN the user activates Cancel, the close button,
  Escape or the backdrop on a modal with no unsaved change, the system shall
  close it.
- U-20a. [Unwanted behavior] IF the user activates any of those on a modal
  whose name, diff or expectation file, start line or end line differs from
  what it opened with or last saved, THEN the system shall ask for confirmation and close only on
  confirmation.
- U-20b. [Ubiquitous] The system shall treat a draft-run result as not an
  unsaved change.

### Evals tab (criteria 32–37, 62)

- U-21. [Ubiquitous] The system shall list an "Evals" tab in the Agent editor
  after Context and accept `?tab=evals`.
- U-22. [Event-driven] WHEN the tab opens, the system shall show the three
  metrics and the pass count of the agent's latest completed run, each metric
  with its delta from the previous completed run when one exists.
- U-23. [Ubiquitous] The system shall show each case as a row with: a result
  indicator (passed, failed, errored, never run), the case name, the
  expectation type in words, the target file and lines, the finding's
  severity and category, and edit and delete actions.
- U-23a. [Ubiquitous] The system shall word the result line of a
  `must_not_flag` row as "must not flag · matched N", where a `must_find` row
  reads "expected N finding, got M" *(spec-defined, no design image)*.
- U-24. [Ubiquitous] The system shall show the count of passing cases out of
  all cases in the set, derived from the same rows the list renders.
- U-25. [Event-driven] WHEN the user activates edit on a row, the system
  shall open the case modal on that case, with the strip showing the case's
  last recorded outcome until a draft run replaces it.
- U-26. [Event-driven] WHEN the user activates delete on a row and confirms,
  the system shall remove the row and refresh the counts.
- U-27. [State-driven] WHILE the set is empty, the system shall show the
  empty state and render "Run all evals" disabled.
- U-28. [Event-driven] WHEN the user activates "View full dashboard", the
  system shall navigate to that agent's dashboard page.
- U-29. [Ubiquitous] The system shall show no run history and no Compare in
  the Evals tab.

### Running the set (criteria 38, 42–47)

- U-30. [Ubiquitous] The system shall offer the set-run action in the Evals
  tab and on the agent's dashboard page, with the same behavior in both.
- U-31. [Event-driven] WHEN the user starts a set run, the system shall begin
  polling that run until its status is no longer running.
- U-32. [State-driven] WHILE a set run is in progress, the system shall
  replace the run button's idle label with "Running n / N" (cases finished
  out of cases covered) and a progress bar, and render every set-run action
  for that agent disabled *(spec-defined, no design image)*.
- U-33. [Event-driven] WHEN the page loads and the agent already has a run in
  progress, the system shall resume showing its progress.
- U-34. [Event-driven] WHEN a set run completes, the system shall refresh the
  metrics, the case results and the run history without a page reload.
- U-35. [Unwanted behavior] IF a set run ends failed, THEN the system shall
  show its reason and keep the previous completed run's metrics visible
  *(spec-defined, no design image)*.
- U-36. [Unwanted behavior] IF a completed run has errored cases, THEN the
  system shall show how many errored and mark those rows as errored, distinct
  from failed.
- U-36a. [Ubiquitous] The system shall give an errored case row its own icon,
  different from the passed, failed and never-run icons, and shall reveal the
  error reason on hover, on keyboard focus and on expanding the row
  *(spec-defined, no design image)*.

### Generic states

- U-37. [State-driven] WHILE eval data is loading, the system shall show a
  loading state in place of each list and metric card.
- U-38. [Unwanted behavior] IF an eval request fails, THEN the system shall
  show an error state with a retry, in place of the content it could not
  load.
- U-39. [Unwanted behavior] IF a metric is null, THEN the system shall show
  a not-applicable mark and no delta for it.
- U-40. [Unwanted behavior] IF a case name or file path is longer than its
  row, THEN the system shall truncate it visually and expose the full text.

### Dashboard index (criteria 68–71)

- U-41. [Ubiquitous] The system shall serve the Eval Dashboard at a
  top-level route that is not repo-scoped, with breadcrumb "Skills Lab › Eval
  Dashboard".
- U-42. [Ubiquitous] The system shall show one row per agent with name,
  model, and either the latest completed run's version label, start time,
  pass count and three metrics, or a "no runs yet" state.
- U-43. [Event-driven] WHEN the user activates an agent row, the system shall
  navigate to that agent's dashboard page.
- U-44. [Ubiquitous] The system shall show a "recent eval runs" table across
  all agents with agent name, start time, version label, three metrics and
  pass count.
- U-45. [State-driven] WHILE the workspace has no eval run at all, the system
  shall show the existing "no runs yet" copy in place of the recent-runs
  table.
- U-46. [Ubiquitous] The system shall show an "Eval Dashboard" item in the
  sidebar's Skills Lab group after Conventions, highlighted on every route
  under the dashboard.

### Dashboard agent page and Compare (criteria 61–67)

- U-47. [Ubiquitous] The system shall show a back link to the dashboard
  index, the agent's name and model, three metric cards with deltas, and the
  runs table.
- U-48. [Ubiquitous] The system shall show each run row with start time,
  version label, recall, precision, citation accuracy, pass count and cost,
  newest first.
- U-49. [Ubiquitous] The system shall offer a selection checkbox only on
  completed runs.
- U-50. [State-driven] WHILE exactly two runs are selected, the system shall
  enable Compare and show the selected count.
- U-51. [State-driven] WHILE fewer or more than two runs are selected, the
  system shall render Compare disabled.
- U-52. [Event-driven] WHEN the user activates Compare, the system shall open
  a modal titled with both version labels, older first, showing for recall,
  precision, citation accuracy and cost the older value, the newer value and
  the signed difference.
- U-53. [Ubiquitous] The system shall color a metric difference by whether it
  is an improvement — higher is better for the three metrics, lower is better
  for cost — and shall also show its direction as a sign or arrow.
- U-54. [Ubiquitous] The system shall show the system prompt diff as
  preformatted text with added and removed lines each marked by a prefix as
  well as a background.
- U-55. [Unwanted behavior] IF the two prompts are identical, THEN the system
  shall show "prompt unchanged" and list the model and skill differences the
  server returned.
- U-56. [Unwanted behavior] IF the server reports that the two runs cover
  different cases or that a shared case was edited between them, THEN the
  system shall show the warning with those counts above the metric deltas.
- U-57. [Event-driven] WHEN the user closes the Compare modal, the system
  shall keep the two runs selected.

### Structure

- U-58. [Ubiquitous] The client shall read and write eval data only through
  hooks in `src/lib/hooks/`, shall take every eval domain type from
  `@devdigest/shared`, and shall compute no metric, delta, pass count,
  matched flag or pass / fail outcome that the server returns.
- U-59. [Ubiquitous] The client shall render case names, finding titles,
  provider error text and prompt text as plain text, never as Markdown or
  HTML.
- U-60. [Ubiquitous] The client shall hold the draft only in the modal's
  state and shall send it to the server only on Run case and Save.

## Edge cases

### Missing states — designs checked

| State | In a design? | Resolution |
|---|---|---|
| Draft loading / refused | No | U-4, U-5 |
| Modal for a `must_not_flag` case | **No** (`6.png` is `must_find` and shows no type anywhere) | U-9, U-9a — spec-defined, no design image |
| Invalid expected output | Partly: `6.png` shows only the valid badge | U-13; copy `caseEditor.invalidJson` exists |
| Draft run pending | **No** | U-16a — spec-defined, no design image |
| Draft run failed / timed out | **No** | U-16d — spec-defined, no design image |
| Draft result failed | **No** (`6.png` shows "Last run passed") | U-16b; copy `caseEditor.lastRunFailed` exists |
| Draft result out of date | **No** | U-17 — spec-defined, no design image |
| Draft whose expectation must be moved (criterion 8a) | **No** | U-13a — spec-defined, no design image |
| Surviving findings list in the modal | **No** — `6.png` shows only the one-line strip | U-16b (the course asks that the user "sees the agent's actual result") — the list is spec-defined, no design image |
| Save disabled until run; confirm on failing | No | U-18, U-18a |
| Discard confirmation | No | U-20a |
| Empty case set | No | U-27; copy `evalsTab.emptyCases` exists |
| Fewer than 8 cases | No | Not blocked (SPEC-11 P4) |
| Set run in progress / failed | **No** | U-32, U-35 — spec-defined, no design image |
| Errored case row | **No** | U-36, U-36a — spec-defined, no design image |
| `must_not_flag` case row | **No** — every row in `5.png` reads "expected N finding, got M" | U-23, U-23a — spec-defined, no design image |
| Agent with no runs | Partly (`5.png` never-run row) | U-22 has no completed run, so the cards show the not-applicable mark (U-39); U-42 |
| One completed run | No | U-51; no delta |
| Loading / error / offline | No | U-37, U-38. A network failure is `ApiError` with `status: 0` |

### Corner cases

| Case | Resolution |
|---|---|
| The card is rendered in the diff viewer or the outdated-findings list | U-1, U-7 hold for all three consumers. An outdated finding gets U-5 |
| The modal is opened from inside the diff viewer's own layering | One modal instance per page, owned above the card, not inside each `FindingCard` |
| The user closes the modal while a draft run is pending | U-20a applies if there are edits; the request is not cancelled, its result is dropped, and its cost is still spent |
| The user edits only the name after a draft run | The result stays current: U-17 watches the diff and expectation only |
| The user reverts an edit back to the content that was run | U-17 compares content, so the result is current again |
| A draft run returns after the user already edited the content | U-17 marks it out of date immediately |
| The same draft run twice gives different outcomes | Possible; the model is not deterministic. The strip shows the latest |
| Edit mode on a case whose source finding was deleted | Works; the PR meta comes from the stored case |
| Edit mode: is Save gated on a run? | Yes, by the same U-18 rule once the diff or expectation changes; a name-only change saves without a run |
| The user selects two runs, then the table refreshes | Selection is keyed by run id and survives |
| The compared runs have the same version label | U-52 still titles with both; U-55 explains the difference |
| A very long diff or prompt | The text area and the diff area scroll inside the modal |
| The tab is closed during a set run | The run continues on the server; U-33 on return |
| Delete or edit a case while a set run is in progress | Not blocked in the UI; server behavior is an open item in SPEC-12's edge cases |
| `?tab=evals` on an agent that does not exist | Existing not-found handling in `src/app/agents/[id]/page.tsx` |

### Cross-module dependencies

| This UI | Depends on | Note |
|---|---|---|
| `FindingCard` action | The shared card's props; `FindingsPanel` and `DiffTab` own the mutation hooks (`FindingsPanel.tsx:35`, `DiffTab.tsx:40`) | `FindingCard.onAction` is typed by `FindingActionKind` (`accept / dismiss / learn / reply`, `src/vendor/shared/contracts/findings.ts:87`). Opening the modal is not a finding action and writes nothing — **unresolved** for the planner: a separate callback prop is the likely shape; a contract change is not needed |
| Case modal | PR page and Agent editor | Two routes → `src/components/` from the first change |
| Expected output editor | No code-editor primitive in `@devdigest/ui` | The planner decides between `Textarea` with monospace styling and a new dependency; a new dependency needs its own justification |
| Sidebar item | `src/vendor/ui/nav.ts:21-40` | Vendored; decided (Q4): one item as a scoped exception like `nav.ts:26-29`. `useGlobalShortcuts` and `useShellCommands` read `NAV`, so the item also appears in the command palette |
| Evals tab | `AgentEditor/constants.ts` `TABS`, `page.tsx` `VALID_TABS` | Both lists must gain the key |
| All eval types | `@devdigest/shared` (`src/vendor/shared`, derived) | Depends on the additive contract changes (Q3) being made on the server first and synced |
| Query invalidation | Save and delete invalidate the agent's case list; a completed set run invalidates cases, metrics, runs and the dashboard. Reviews queries are **not** invalidated by any eval action | Criterion 31, 49 |

## Non-functional requirements

- **Accessibility.** Result indicators carry a text label or `aria-label`.
  The case modal and the Compare modal trap focus; Escape goes through U-20 /
  U-20a. Disabled actions expose why (U-2, U-13, U-18). The valid / invalid
  badge is announced when it changes.
- **i18n.** Reuse `eval.json` `caseEditor.*`, `evalsTab.*`, `dashboard.*`
  where they fit. New keys: the button and its hint; the expectation type
  words; draft refusal reasons; result out of date; timeout; cost unknown;
  "run the case first"; "save a failing case?"; discard confirmation; set-run
  running / failed / errored; the compare modal; the null mark. Percentages
  are whole numbers with `%`; deltas are in points; cost through
  `formatCost` and duration through `formatSeconds` (`src/lib/format.ts:14,22`).
- **Spend visibility.** U-17a for Run case; the set-run action likewise
  (SPEC-11 P8).
- **Tests.** Component tests under vitest + jsdom with `fetch` mocked: the
  button states, the modal's validation, the Save gate, the stale flag, the
  discard confirmation, Compare enablement, and the action becoming enabled
  after accept or dismiss (U-2a). These client component tests are written in
  a separate `test-writer` pass after implementation, not by the implementing
  units. Nothing here can be an e2e flow that runs a case (`e2e/AGENTS.md`).

## Inputs and provenance

| Input | Source | Validated today |
|---|---|---|
| Finding id sent for the draft, draft run and save | `FindingRecord.id` from `GET /pulls/:id/reviews` | Server: none found for an eval route (SPEC-12 A-5) |
| `accepted_at` / `dismissed_at` deciding U-2 | `FindingRecord` (`src/vendor/shared/contracts/review-api.ts:16-20`) | Shape via the shared contract; the server re-checks (criterion 6) |
| Name, typed | Modal state | Client: U-14. Server: none found (SPEC-12 A-19) |
| Diff, typed or pre-filled | Modal state | Client: none (free text). Server: none found (SPEC-12 A-11) |
| Severity, category, title shown beside the expectation | Draft or case response | Read-only reference; never sent back (U-11a) |
| Expected output JSON (`file`, `start_line`, `end_line` only), typed or pre-filled | Modal state | Client: U-12 / U-13 (shape only — the hunk-intersection check needs the parsed diff and is the server's, SPEC-12 A-12). Server: none found |
| Expectation type shown in the modal | Draft response | Read-only; echoed on save only for the comparison in SPEC-12 A-20 |
| PR meta shown in the modal | Draft or case response | Read-only; never sent back |
| Agent id in the route / tab, `?tab=` | URL | `VALID_TABS` (`src/app/agents/[id]/page.tsx:15,28`); server `IdParams` |
| Selected run ids | Checkbox state | Server: none found (SPEC-12 A-33) |
| Metrics, deltas, pass counts, version labels, prompt texts, draft-run outcome | API responses | Contracts to be added (Q3) |

## Untrusted inputs

| Field | Boundary | Server-side validation today |
|---|---|---|
| Diff text typed in the modal | User → API → agent prompt | none found (SPEC-12 A-11); wrapped in the prompt at `reviewer-core/src/prompt.ts:143` |
| Expected output typed in the modal | User → API → scoring → DB | none found (SPEC-12 A-12) |
| Name typed in the modal | User → API → DB → rendered | none found (SPEC-12 A-19); U-59 |
| Pre-filled name and display fields (from a model-written finding) | LLM → DB → draft response → rendered and editable | `Finding` shape only (`server/src/vendor/shared/contracts/findings.ts:47-67`); U-59 |
| PR title / body shown in the PR meta tab | PR author → DB → rendered | none found; U-59 — plain text, not `Markdown` |
| Draft-run findings (title, file) | LLM → gate → response → rendered | `Review` schema and `groundFindings` (`reviewer-core/src/grounding.ts:52`); U-59 |
| Draft-run / set-run error text | Provider or server exception → rendered | none found; U-59 |
| System prompts in the compare diff | User-authored → DB → rendered | `z.string().min(1)` (`server/src/modules/agents/routes.ts:72`); U-54, U-59 |
| `?tab=`, route params | URL | `VALID_TABS`; server `IdParams` |

## Open questions

No blocking question remains. N1–N5 are resolved in SPEC-11's Decisions
table. The former U-Q1 to U-Q3 (presentation of states no image shows) were
accepted by the user and are now criteria: U-Q1 → U-9a, U-23a, U-36a;
U-Q2 → U-16a, U-16d, U-17, U-32, U-35; U-Q3 → U-16b.

UX proposals — not requirements unless accepted:

- **U-Q4 `[UX proposal]`.** Show the delete confirmation inline in the row
  rather than as a second modal.
- **U-Q5 `[UX proposal]`.** On the PR page, mark a finding that is already in
  an eval set. Needs a field `FindingRecord` does not have.
