# Spec: Onboarding Tour — client refinement
Spec ID: SPEC-07
Status: draft
Supersedes: none

This file refines `../../specs/L05b-onboarding-tour.md` (SPEC-05). Scope,
user stories and the cross-package criteria (AC-n) live in SPEC-05. The
planner freezes component and hook names. Placement below follows the
`frontend-ui-architecture` skill. Criteria here are numbered `C-n`.

## Problem and user

INSIGHTS entries that bear on the client (loaded this session):

- `client/INSIGHTS.md` 2026-09-18, "promote on second consumer". The tour is
  a single route, so all new UI stays under that route's `_components/`.
  `MermaidDiagram` is already shared (`client/src/components/mermaid-diagram/`)
  and is reused, not copied.
- `client/INSIGHTS.md` 2026-09-17, "`src/vendor/shared` drifted". Contracts
  are consumed only after the server copy lands and is synced.
- `client/INSIGHTS.md` 2026-09-18, "`{count}` has no thousands separator".
  Pre-format "index of N files" before interpolating (the mock shows
  "12,450").
- `client/INSIGHTS.md` 2026-09-22, "the pre-translated contract is a
  docstring". Grep the new JSX for literal `aria-label`/`title` strings.
- `client/INSIGHTS.md` 2026-09-27, "identical i18n text breaks `getByText`".
  "Open" appears once per critical-path row, and "Copy" once per command, so
  tests query by row.

Design inputs: images 1 and 2 of SPEC-05 (read this session). **First
tasks has no design.** C-15 is a draft layout that has not been checked
against any mock.

## Goals / Non-goals

Goals are those of SPEC-05. Client Non-goals:

- no client-side ranking, filtering or re-ordering of tour items, because
  every list arrives ordered from the server (business-logic ladder rung 1);
- no display of cost in v1 (SPEC-05 OQ-4 is a UX proposal).

## User stories

See SPEC-05.

## Acceptance criteria (EARS)

Route, navigation, placement

1. [Ubiquitous] The client shall serve the tour at `/repos/[repoId]/onboarding`, with a thin `page.tsx` that renders a route-local `_components/OnboardingTourView/`. Sub-parts go under its own `_components/`: header, TOC, one card per section. Pure helpers go in a sibling `helpers.ts`, and copy in `messages/en/onboarding.json`.
2. [Ubiquitous] The client shall add an "Onboarding Tour" item to the WORKSPACE group of the vendored `client/src/vendor/ui/nav.ts` (`:21-29`), between Pull Requests and Project Context (image 1), with href `/repos/:repoId/onboarding`. This is a deliberate, scoped vendor exception with the same precedent as L05's entry (`nav.ts:26`).
3. [Ubiquitous] The client shall highlight the Onboarding Tour sidebar item only on `/repos/:repoId/onboarding`. It shall stop `activeKeyFor` (`client/src/components/app-shell/helpers.ts:29`) from mapping the Add-repository wizard `/onboarding` (`client/src/app/onboarding/page.tsx`) to `"onboarding-tour"`.
4. [Ubiquitous] The client shall fetch tour data only through new hooks in `client/src/lib/hooks/` built on `apiFetch`: tour read, generate mutation, and reuse of the existing `useIndexState` (`client/src/lib/hooks/repo-intel.ts:13-25`). There shall be no bare `fetch`.

Header (image 1)

5. [Ubiquitous] The client shall render the title "Onboarding for <repo name>", with the repo name in the accent style, and the subline "Generated from index of {N} files · last refreshed {relative}". N is the pre-formatted `index.files_indexed` for the tour's `index_sha`. `{relative}` is `generated_at` rendered with next-intl's relative-time formatter.
6. [State-driven] WHILE the tour has `index_partial: true`, the client shall append "· partial index" to the subline, with a tooltip explaining that the index was bounded or incomplete.
7. [State-driven] WHILE the tour has `ranking: "graph_only"`, the client shall show under the Guided reading path heading a note that the order uses import structure only because commit history was unavailable.

States (not in the mock)

8. [State-driven] WHILE the tour read is loading, the client shall render `Skeleton` placeholders (`@devdigest/ui`) for the header and the five cards.
9. [State-driven] WHILE `state` is `none`, the client shall render an `EmptyState` with a Generate call to action. The body copy shall be rewritten to name the five SPEC-05 sections, replacing the stale list in `onboarding.json:9`.
10. [State-driven] WHILE `state` is `generating`, the client shall disable Regenerate, show "Regenerating…" (`onboarding.json:5`), keep rendering the previous tour if one is returned, and poll the tour read until the state is terminal.
11. [State-driven] WHILE `state` is `skeleton`, the client shall show a banner at the top naming the reason in plain words (not cloned, repo-intel disabled, index missing or degraded, generation failed, invalid model output), plus the relevant next step (wait for indexing, resync, retry). It shall render every deterministic list with no reasons, comments or rationales.
12. [State-driven] WHILE `tour.stale` is true, the client shall show a banner stating that the tour was generated from an older index, show both short SHAs, and point the user to Regenerate.
13. [Unwanted behavior] IF the tour read fails, THEN the client shall render `ErrorState` with the existing `loadError.title` copy (`onboarding.json:14-16`) and a retry.

Sections (images 1 and 2)

14. [Ubiquitous] The client shall render the five sections as collapsible cards in SPEC-05 AC-2 order, each with its icon and a chevron toggle, all expanded by default, and a left "On this page" TOC whose items scroll to their card and highlight the card in view.
15. [Ubiquitous] The client shall render **First tasks** (design supplied 2026-09-30) as a responsive grid of up to three cards per row. Each card shows the task `title` in bold, its first `paths` entry as a mono line linked to GitHub at `index_sha`, and a complexity badge (`low` green, `medium` amber, `high` red) whose label comes from `onboarding.json`. The task `detail` is exposed as the card tooltip, not as visible body text.
16. [Ubiquitous] The client shall render the Architecture prose through the `Markdown` primitive, and the diagram through the shared `MermaidDiagram`.
16a. [Unwanted behavior] IF the diagram is null or fails to parse, THEN the client shall render no diagram container at all, rather than an empty bordered box.
17. [Event-driven] WHEN the user clicks a critical-path row's **Open**, the client shall open `githubBlobUrl(<owner/name>, index_sha, path)` (`client/src/lib/github-urls.ts:24-37`) in a new tab, pinned to the SHA the tour was generated from.
18. [Event-driven] WHEN the user clicks a command's copy icon, the client shall copy that one command line, including its `# comment` if present, to the clipboard and show brief "Copied" feedback, following the `PromptBlock` pattern (`navigator.clipboard?.writeText`).
19. [Ubiquitous] The client shall render the Guided reading path as a numbered list: an accent number circle, a mono path, and a grey rationale line beneath. When the rationale is null, it shall show the path only.
20. [Ubiquitous] The client shall truncate a long path in a single-line row with an ellipsis and show the full path in a tooltip, keeping the Open and copy buttons visible.

Actions

21. [Event-driven] WHEN the user clicks Regenerate (or Generate), the client shall call the generate mutation and switch to the `generating` state. If the server returns `reused: true`, it shall not show an error.
22. [Event-driven] WHEN the user clicks Share link, the client shall copy `window.location.origin + /repos/<repoId>/onboarding#<active-section-anchor>` to the clipboard and show a toast. It shall make no network call (SPEC-05 AC-44).
23. [Event-driven] WHEN the page loads with a `#<section>` hash, the client shall scroll to and highlight that section once data renders.

Accessibility and i18n

24. [Ubiquitous] The client shall give every icon-only control (copy, chevron) a translated accessible name, expose the card toggles as buttons with `aria-expanded`, and keep all five cards and the TOC keyboard-operable.
25. [Ubiquitous] The client shall source every user-facing string from `messages/en/onboarding.json`.

## Edge cases

- The TOC is fixed at the five sections. A skeleton still has all five
  anchors, and First tasks shows its "not available" state.
- An LLM-written architecture paragraph can mention a path the server did
  not link (SPEC-05 AC-19). It arrives as plain inline code and is shown
  as-is.
- A very long command (an unusual script name) wraps instead of
  overflowing, so the copy icon stays reachable.
- Share link on `localhost` only works for someone who can reach this
  instance. This is accepted per SPEC-05 OQ-2, which was confirmed on
  2026-09-29.

### Cross-module dependencies

- The tour routes (SPEC-06 S-3/S-4) and `GET /repos/:id/index-state`.
- The vendored `nav.ts` (a scoped exception), `app-shell/helpers.ts`, the
  shared `MermaidDiagram`, `github-urls.ts`, and the `@devdigest/ui`
  primitives (`Skeleton`, `EmptyState`, `ErrorState`, `Markdown`).

## Non-functional requirements

See SPEC-05. There are no new dependencies (`mermaid`, `react-markdown` and
next-intl are already present).

## Inputs and provenance

All data comes from the tour read API, validated server-side (SPEC-06 S-5,
S-9). The client parses nothing itself.

## Untrusted inputs

LLM prose and repo-derived paths reach the DOM. The protections are:

- `Markdown` renders without raw HTML
  (`client/src/vendor/ui/primitives/Markdown.tsx:1-14`);
- `MermaidDiagram` uses `securityLevel: "strict"` (`MermaidDiagram.tsx:37`);
- paths and commands render as text nodes only, never through
  `dangerouslySetInnerHTML`.

## Open questions

None specific to the client. SPEC-05 OQ-1 to OQ-3 are closed, and OQ-4 to
OQ-6 are UX proposals. The First tasks layout (C-15) is a draft pending a
design.
