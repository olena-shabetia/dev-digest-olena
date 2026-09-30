# Spec: Project Context — client refinement
Spec ID: SPEC-03
Status: draft
Supersedes: none

This file refines `../../specs/L05-project-context.md` (SPEC-01). Scope, user
stories and the cross-package criteria (AC-n) live in SPEC-01. The planner
freezes component names and hook names. Placement below follows the
`frontend-ui-architecture` skill.

## Problem and user

INSIGHTS entries that bear on the client (loaded this session):

- `client/INSIGHTS.md` 2026-09-18, "promote on second consumer". The document
  picker has two consumers from day one: the Agent editor, which is
  route-local, and the Skill editor, which is already shared at
  `client/src/components/skill-editor`. The preview drawer has three
  consumers, the Project Context page being the third. So both are
  created directly under `client/src/components/`, and this is not
  speculative promotion.
- `client/INSIGHTS.md` 2026-09-18, "`{count}` has no thousands separator".
  Pre-format the `≈ N tokens` value with `formatTokenCount`
  (`client/src/lib/format.ts:37`) before interpolating it.
- `client/INSIGHTS.md` 2026-09-18, "count badge at the same pipeline stage".
  `N of M attached` is ambiguous while a filter is active (see OQ-C1).
- `client/INSIGHTS.md` 2026-09-22, "pre-translated contract is a docstring".
  Grep the new JSX for literal `aria-label`/`title` strings.
- `client/INSIGHTS.md` 2026-09-27, "identical i18n text breaks `getByText`".
  "Preview" appears as both a row button and a page toggle.
- `client/INSIGHTS.md` 2026-09-17 (superseded 2026-09-27), "vendor/shared
  drift". Diff before syncing new contracts.

Existing surfaces:

- Agent editor tabs are `config` and `skills` only
  (`client/src/app/agents/[id]/_components/AgentEditor/constants.ts:14-16`).
- Skill editor tabs are config, preview, evals, stats and versions
  (`client/src/components/skill-editor/constants.ts:11-16`).
- The trace already renders "Specs read" and a specs prompt block
  (`.../RunTraceDrawer/_components/TraceBody/TraceBody.tsx:38-49,89-91`),
  with the i18n labels `runs.trace.config.specsRead` and
  `runs.trace.prompt.specs = "Project context (dynamic)"`
  (`client/messages/en/runs.json:35,50`).
- `useContextFiles` and `useReindexContext` exist in
  `client/src/lib/hooks/core.ts:122-137`.
- `messages/en/context.json` holds page copy.
- The sidebar has no Project Context item (`client/src/vendor/ui/nav.ts:21-35`),
  but `activeKeyFor` already maps `/context`
  (`client/src/components/app-shell/helpers.ts:30`).

Designs: images 1–10 (paths in SPEC-01), all read this session. Images 9
and 10, added 2026-09-29, show the trace's project-context modal.

## Goals / Non-goals

**Goals:**

- An Agent editor **Context** tab (image 2).
- A Skill editor **Context** tab (image 3).
- A document preview drawer (images 6 and 7).
- Trace updates (images 4 and 8), and the project-context modal (images 9 and 10).
- A view-only repo Project Context page (browse, preview, rescan, empty
  state; images 1 and 5), reachable via a workspace sidebar entry (AC-20a,
  required). Decided 2026-09-29, SPEC-01 OQ-3 and OQ-C3.

**Non-goals:**

- The Edit toggle and the new-file, new-folder and upload icons. Editing is
  deferred to a future feature; see SPEC-01 Non-goals for why it is not
  small.
- The "chunks" indexed footer.
- The "78 COVERAGE" ring.
- The Evals, Stats and CI tabs shown in image 2's tab bar. Of those, only
  Context is added.
- The Preview, Evals, Stats and Versions tabs in image 3. They already exist
  and are unchanged.

## User stories

These are the client slices of SPEC-01 US-1 to US-4.

## Acceptance criteria (EARS)

Agent editor — Context tab (image 2)

1. [Ubiquitous] The Agent editor shall show a "Context" tab after "Skills" in `TABS`.
2. [Event-driven] WHEN the Context tab opens, the system shall list the active repository's discovered documents, with checkboxes reflecting this agent's attachments **for the active repository only** (`repo_id`-scoped; SPEC-01 OQ-1 decided). Each row shall show a checkbox, the filename, the directory (e.g. `specs/`), a type chip (`specs`, `docs` or `insights`) and a Preview button.
2a. [State-driven] WHILE a document's listing entry has `truncated: true`, its row shall show a "truncated to ≈ 3,000 tokens" indicator, and its footer contribution shall be the capped token count (SPEC-01 AC-7c).
2b. [Event-driven] WHEN the user switches the active repository in the shell, the Context tab shall reload both the list and the attachment set for the new repository. Attachments made under the previous repository shall neither appear nor be counted.
3. [Ubiquitous] The tab header shall show "Project context" and a badge "`<attached>` of `<total>` attached", counted for the active repository.
4. [Ubiquitous] The tab shall show the helper copy "Order matters — earlier docs appear earlier in the assembled `## Project context` block. Toggle to attach." (image 2).
5. [Event-driven] WHEN the user toggles a checkbox, the system shall persist the new ordered attachment set for (this agent, active repository) through a `lib/hooks/*` mutation that sends the active `repo_id`. The UI shall update optimistically, and on error it shall roll back and show the error. This mirrors `SkillsTab`'s `setSkills.mutate(next, { onError: () => setOrder(prev) })` (`.../AgentEditor/_components/SkillsTab/SkillsTab.tsx:87`).
6. [Event-driven] WHEN the user drags an attached row by its handle to a new position, the system shall persist the new order (image 2 drag handles; SPEC-01 AC-12).
7. [Event-driven] WHEN the user types in "Filter documents…", the system shall show only rows whose path contains the query, case-insensitively.
8. [Ubiquitous] The tab footer shall show "≈ `<N>` tokens", where N is the sum of the attached documents' server-provided `tokens`, and the note "Injected as an untrusted block (## Project context) into every run."
9. [Ubiquitous] The client shall take every token number from the server response and shall not compute token estimates itself.

Skill editor — Context tab (image 3)

10. [Ubiquitous] The shared Skill editor shall show a "Context" tab after "Config".
11. [Ubiquitous] The Skill editor's Context tab shall reuse the same document picker component as the Agent tab, with the heading "Project context to use", an "`<n>` attached" badge and the copy "Any agent using this skill inherits these documents."
12. [Event-driven] WHEN the user toggles or reorders a document in the Skill editor's Context tab, the system shall persist the skill's ordered attachment set, with optimistic update and rollback as in AC-5.
13. [Ubiquitous] The Skill editor's Context tab shall show a read-only "Serializes as" box. What it renders is decided by SPEC-01 OQ-10. Until then it shall show `## Project context` followed by the attached paths in order, i.e. what actually reaches the prompt.

Preview drawer (images 6, 7)

14. [Event-driven] WHEN the user clicks a row's Preview button, the system shall open a drawer (the `@devdigest/ui` kit `Drawer`, `client/src/vendor/ui/kit/Drawer.tsx`) showing the full repo-relative path, the type chip, "Used by `<N>` agents", "`<N>` tokens", and the document rendered with the `Markdown` primitive (`client/src/vendor/ui/primitives/Markdown.tsx`).
14a. [Ubiquitous] The client shall display the server-provided `used_by_agents` for the active repository in the preview drawer header (images 6, 7) and in the Project Context page's document header (image 1). The client shall not compute or cache the count itself beyond the query cache (SPEC-01 AC-29 to 29c; SPEC-02 AC-15d; decided 2026-09-29, OQ-12). The zero case shall render with a plural-aware `next-intl` key.
14b. [Event-driven] WHEN the user attaches or detaches a document (row checkbox or drawer toggle), the system shall invalidate the listing and preview queries for that repository, so the next render shows the live count.
15. [Event-driven] WHEN the user clicks the drawer's "Attached" toggle, the system shall attach or detach that document for the current agent or skill, exactly like the row checkbox.
16. [Unwanted behavior] IF loading the preview content fails, THEN the drawer shall show an `ErrorState` with a retry action and shall not render partial content.

Run trace (images 4, 8; row content only. The row order in the images is illustrative, not binding)

17z. [Ubiquitous] `TraceBody` shall render the Prompt assembly rows in the actual prompt assembly order, with Project context after Repo skeleton and before Callers, as it already does today (`TraceBody.tsx:86-94`). It shall not reorder the rows to match images 4, 8 or 10 (decided 2026-09-29, SPEC-01 OQ-11, AC-26g).

17. [Ubiquitous] The trace "Specs read" row shall list each injected path with its token estimate from the new trace field (SPEC-02 AC-28). For traces that lack the field, it shall fall back to showing bare paths.
18. [Ubiquitous] The specs prompt block label shall read "Project context — attached specs (untrusted)" (replacing "Project context (dynamic)" at `runs.json:50`), and the block shall pass `specs_tokens` to `PromptBlock`'s `tokens` prop, as the skills block does (`TraceBody.tsx:76-81`).
19. [Ubiquitous] The specs prompt block shall keep the existing copy and expand/fullscreen affordances so the user can read the full injected text.

Project-context modal (images 9, 10; added 2026-09-29)

19a. [Event-driven] WHEN the user clicks the "Project context — attached specs (untrusted)" row's **separate expand (fullscreen) icon button**, the system shall open a modal titled exactly "Project context — attached specs (untrusted)", i.e. the row label. A click on the row body shall keep today's inline toggle and shall not open the modal (decided 2026-09-29, OQ-C6). The existing `PromptBlock` already behaves this way: the icon button opens a `Modal` with `title={label}` (`.../RunTraceDrawer/_components/PromptBlock/PromptBlock.tsx:69-80,92-104`), and the row header toggles inline (`:49`). So this is satisfied by AC-18's relabel. The modal shall not be rebuilt.
19b. [Ubiquitous] The modal body shall render, in monospace with no markdown rendering and no re-fetch, a **cleaned view** of the persisted raw `trace.prompt_assembly.specs` (decided 2026-09-29, SPEC-01 OQ-16, matching image 9). The cleaned view is produced by a pure helper (e.g. `stripUntrustedDelimiters(text)` in a sibling `helpers.ts`). The helper removes every line that is exactly an opening delimiter (`^<untrusted source="[^"\n]*">$`) or exactly `</untrusted>`, and leaves everything else byte-for-byte: the `## Project context` heading, the guard comment line, `### <path>` headings, bodies, blank lines, the truncation marker, and escaped `<\/untrusted>` text. The helper shall never modify the persisted trace data.
19b1. [Ubiquitous] The cleaning shall apply only to the Project-context row, through an optional display-transform prop on `PromptBlock`. Other prompt rows (System, Skills, Repo skeleton, Callers, User/diff) shall keep showing their raw text unchanged. On the Project-context row the transform shall apply consistently to the inline `<pre>`, the modal body, and both copy actions.
19b2. [Ubiquitous] The system shall include a unit test for the helper with a two-document raw block (expected output equals image 9's text shape), and a test that a body line containing the escaped `<\/untrusted>` is preserved.
19c. [Event-driven] WHEN the user types in "Search in this block…", the system shall filter and highlight matching lines of the cleaned view on the client only. The existing `PromptModalBody` already does this (`.../PromptModalBody/PromptModalBody.tsx:11-27,39,46`), and it shall be reused with the cleaned text as input.
19d. [Event-driven] WHEN the user clicks the modal's "Copy" button, the system shall copy the full cleaned view regardless of the active search. Today's `copy()` writes the raw `text` (`PromptBlock.tsx:42-46`), so it must copy the transformed text for this row. The raw text remains available through the drawer's "Copy raw output" and the persisted trace.
19e. [Event-driven] WHEN the user closes the modal with × or Escape, the system shall return to the trace drawer with its section open/closed state and scroll position unchanged. The modal is a local overlay (`PromptBlock.tsx:40,96`) and does not remount the drawer, so a test shall assert this rather than new code.

Project Context page (images 1, 5; read-only scope)

20. [Ubiquitous] The system shall serve a repo-scoped, **view-only** page at `/repos/[repoId]/context` that lists discovered documents, previews the selected one, and offers a rescan. It shall render no Edit toggle and no new-file, new-folder or upload controls (decided 2026-09-29, SPEC-01 OQ-3; the rationale is in SPEC-01 Non-goals).
20a. [Ubiquitous] The workspace sidebar **must** show a "Project Context" nav entry. It shall be added to `client/src/vendor/ui/nav.ts`'s `NAV` in the `WORKSPACE` section, after "Pull Requests" (images 1, 5 and 10 show it there), with `key: "context"` and `href: "/repos/:repoId/context"`. It follows the precedent of the Conventions entry added in commit `455a987` (L02/HW2), which added `{ key: "conventions", …, href: "/repos/:repoId/conventions", gKey: "c" }` plus its shortcut row. The `key` shall be `"context"` so that the existing `activeKeyFor` mapping (`client/src/components/app-shell/helpers.ts:30`) highlights it, and so that the existing `shell.nav.context` = "Project Context" i18n key (`client/messages/en/shell.json`) applies. A `gKey` shortcut is optional. If one is added, it must not collide with existing ones (`p`, `s`, `a`, `c`) and must get a matching `SHORTCUTS` row. This is a hard requirement of the feature (decided 2026-09-29, OQ-C3 closed).
20b. [Event-driven] WHEN the user clicks the "Project Context" sidebar entry, the system shall navigate to `/repos/<active repo id>/context` (via `resolveHref`, `nav.ts:71-73`) and mark the entry active.
21. [State-driven] WHILE the document list is loading, the page and both Context tabs shall show `Skeleton` rows.
22. [Unwanted behavior] IF the document list request fails, THEN the page and both Context tabs shall show an `ErrorState` with the existing `context.loadError` copy and a retry action.
23. [State-driven] WHILE the repository has zero discovered documents, the page shall show the empty state from image 5 ("No spec files yet" plus body copy). The body copy shall be updated to name the actual search roots rather than `.devdigest/specs/` (`context.json:13`; SPEC-01 OQ-3).
24. [State-driven] WHILE the repository has zero discovered documents, the Agent and Skill Context tabs shall show an empty state that links to the Project Context page.
25. [State-driven] WHILE the filter matches no documents, the Context tabs shall show a "no matches" message and keep the footer total unchanged.
26. [State-driven] WHILE no repository is active in the shell, the Context tabs shall show a prompt to select a repository instead of a list, and shall offer no attach controls, because every attachment requires a `repo_id` (SPEC-01 OQ-1 decided).

Placement and conventions

27. [Ubiquitous] The document picker and the preview drawer shall live under `client/src/components/<kebab-case>/`. The Agent Context tab shall live at `AgentEditor/_components/ContextTab/`. The Skill Context tab shall live at `skill-editor/_components/ContextTab/`.
28. [Ubiquitous] All data shall flow through hooks in `client/src/lib/hooks/*` on `apiFetch`, reusing or extending `useContextFiles`. No bare `fetch` is allowed.
29. [Ubiquitous] All user-facing strings shall be `next-intl` keys. Domain types shall come from `@devdigest/shared` via `lib/types.ts`.

## Edge cases

- **Attached path missing from the current list.** A path deleted upstream
  still exists as a stored `(repo_id, path)` row but no longer appears in the
  list. Without handling, it becomes an invisible stored attachment. SPEC-01
  OQ-13 proposes a warning row; until that is decided, the badge counts only
  visible attached rows.
- **Attachments made in another repository** are *not* a missing-path case.
  They belong to a different `repo_id`, and the tab never loads them
  (AC-2b; SPEC-01 OQ-1 decided).
- **Repository switched while a mutation is in flight.** The mutation
  carries the `repo_id` captured at click time, so it cannot write into the
  newly active repository's set.
- **Filter active.** It is ambiguous whether "`2 of 7` attached" should
  count across all documents or only the filtered ones (OQ-C1).
- **Reorder while filtered.** Dragging within a filtered subset has
  ambiguous target indices. The proposal is to disable drag while a filter
  is active (OQ-C2).
- **Long paths** such as `incident-2026-04-checkout.md` under deep
  directories. Truncate the directory part with an ellipsis and show the
  full path in a tooltip. The design shows short paths only.
- **Rapid toggles.** Several quick clicks can send overlapping full-replace
  mutations. The last response wins. Disabling rows while a mutation is in
  flight is left to the planner.
- **Inherited documents are not shown** in the Agent tab, so the agent's
  footer total under-reports what the run injects (SPEC-01 OQ-14).

### Cross-module dependencies

Server routes from SPEC-02 (listing, preview, agent attachments, skill
attachments) and the trace contract fields (SPEC-02 AC-28/29), synced into
`client/src/vendor/shared/`.

**Deliberate vendor exception (in scope, required).** The sidebar entry
(AC-20a) edits `client/src/vendor/ui/nav.ts`. That is a vendored file under
the root `AGENTS.md` "Do not touch: `*/src/vendor/**`" rule. Editing it
**is in scope for this feature**, as an explicit, deliberate exception
limited to adding the one `NAV` item (plus an optional `SHORTCUTS` row) in
this one file. The precedent is commit `455a987` (L02/HW2), which added the
Conventions entry to the same file the same way. Reviewers and
`architecture-reviewer`/`pr-self-review` should treat this edit as intended,
not as an accidental vendor edit. No other file under `client/src/vendor/ui/`
is covered by this exception. (Syncing contract changes into
`client/src/vendor/shared/` is the normal, separate server→client sync rule,
not this exception.)

## Non-functional requirements

- Keyboard: checkboxes are focusable and toggle with Space. Reordering has a
  keyboard alternative, e.g. move up/down, because the drag handle alone is
  mouse-only.
- `aria-label`s come from translations, never from literals (client
  INSIGHTS 2026-09-22).
- Token total formatting goes through `formatTokenCount`.

## Inputs and provenance

| Input | Source | Validated |
|---|---|---|
| Document list / preview | Server (SPEC-02) | Typed via `@devdigest/shared`. There is no client-side runtime validation, per the existing pattern. Server-side is covered in SPEC-02. |
| Filter text | User | Local only, never sent to the server. None is needed. |
| Attach toggles / order | User → server | Server-side validation: none found today (SPEC-02 AC-9, AC-21). |

## Untrusted inputs

| Field | Boundary | Current validation |
|---|---|---|
| Document markdown rendered in the drawer and on the page | Repo clone → browser DOM | `react-markdown` without `rehype-raw` renders no raw HTML (`client/src/vendor/ui/primitives/Markdown.tsx:2,10-12`). Server-side: none found. |
| Link `href`s inside rendered markdown | Repo clone → browser | none found. `Markdown.tsx` sets no custom `a` URL check in the lines inspected, so the planner should confirm `react-markdown`'s default URL sanitizer covers `javascript:`. |

## Open questions

- **OQ-C1.** Should the "`N of M attached`" badge count all documents or
  only the filtered ones? The proposal is to count all documents and ignore
  the filter, because the badge describes the agent and not the view.
- **OQ-C2.** Should drag-reorder be disabled while a filter is active? The
  proposal is yes.
- **OQ-C4.** Drag-to-reorder is shown in image 2 and stated in its copy, but
  it is not in the six textual requirements. It was included (AC-6) because
  the design copy states ordering as behavior. Please confirm, or drop AC-6
  and keep insertion order.
- **OQ-C6. CLOSED 2026-09-29.** Keep the existing separate expand icon
  button as the modal trigger; a click on the row does not open it (AC-19a).
- **Closed 2026-09-29 and reflected here:** SPEC-01 OQ-1 (repo-scoped
  attachments: AC-2, 2b, 3, 5, 26), OQ-3 (view-only page: AC-20, Non-goals),
  OQ-5 (truncation indicator: AC-2a), and OQ-16 (display-only delimiter
  stripping: AC-19b to 19d).
- **Closed 2026-09-29:** OQ-C3. The sidebar entry is required, and it is
  now AC-20a/20b, with the vendor exception stated under Cross-module
  dependencies.
- **Still open, not answered by the user, non-blocking; the draft defaults
  apply:** OQ-C1, OQ-C2, OQ-C4 and OQ-C5.
- **OQ-C5.** Image 2 shows 7 documents and image 1 shows a different set of 6.
  The mocks are inconsistent sample data, not a requirement. This note is
  here so nobody builds a fixture to match either one exactly.
- **Closed 2026-09-29:** SPEC-01 OQ-11 (the trace follows the real assembly
  order: AC-17z) and OQ-12 (live, repo-scoped "Used by N agents": AC-14a,
  14b).
- See SPEC-01 OQ-10 ("Serializes as", open, non-blocking) and OQ-13, OQ-14,
  OQ-15 (UX proposals).
