# Spec: PR Brief — client refinement
Spec ID: SPEC-10
Status: draft
Supersedes: none

Refines `../../specs/L05c-pr-brief.md` (SPEC-08). Scope and the numbered AC-n
criteria live there, and this file must not contradict them. Criteria here
are numbered `U-n`. File and folder names are proposals for the planner to
freeze; the placement rules are `client/AGENTS.md` and the
`frontend-ui-architecture` skill.

## Problem and user

INSIGHTS that bear on the client: a component moves to the shared layer only on
its second consumer (2026-09-18), so all new cards stay route-local under
`app/repos/[repoId]/pulls/[number]/_components/`; copy goes through
`next-intl`; `{count}` does not add thousands separators (2026-09-18), so
tokens are formatted in code (`formatTokenCount`, `lib/format.ts:37`); and the
vendor copy of `brief.ts` is synced from the server, never edited first
(2026-09-17).

Existing code this builds on (verified this session):

- `page.tsx` renders `IntentCard` + `BlastRadiusCard` in a wrapping flex row
  under `tab === "overview"`, then `OverviewTab` (the description). Tabs are
  keyed `overview`, `findings`, `diff` in the `?tab` query. `setParam` uses
  `router.replace`.
- `VerdictBanner` is route-local (`_components/VerdictBanner/`), rendered by
  `FindingsTab`, and takes `verdict` (required), `summary`, `score`,
  `findingsCount`, `blockers`, `agentName`.
- `DiffTab` owns Smart order / Original order and renders `DiffViewer` with
  role groups. `FileCard` collapses files over `AUTO_EXPAND_MAX_LINES`
  (`diff-viewer/constants.ts`). There is no file/line addressing.
- Hooks live in `lib/hooks/reviews.ts` (`usePrIntent`, `useDeriveIntent`,
  `useBlastRadius`, `useSmartDiff`, `usePrReviews`). Query keys look like
  `["pr-intent", prId]`.
- `client/messages/en/brief.json` has `block.intent|blast|risks|history`,
  `noRisks`, `noHistory`, `unavailable`, `unavailableHint`.

## Goals / Non-goals

Goals: the Overview layout of AC-38, the states of AC-28 to AC-37, and the
navigation of AC-39 to AC-44. Non-goals: any change to `IntentCard` or
`BlastRadiusCard` internals beyond a slot for Risk areas (U-3); the "Prior
PRs" panel; the "Agent runs" tab; anything in the wrapper bar of images 3–5.

## Acceptance criteria (EARS)

Structure

U-1. [Ubiquitous] The system shall add route-local components under `_components/`, each as `<PascalCase>/<PascalCase>.tsx` plus an `index.ts` barrel, with `styles.ts`, `constants.ts` and `helpers.ts` only when non-empty: `PrBriefCard` (banner, states, Generate/Refresh), `RiskAreas`, and `ReviewFocus`. Business logic (verdict selection, counts, path matching) shall live in `helpers.ts` with unit tests, not in JSX.
U-2. [Ubiquitous] The system shall add `usePrBrief(prId)` (`GET`, key `["pr-brief", prId]`) and `useGenerateBrief(prId)` (`POST`, on success `setQueryData` for the same key) to `lib/hooks/reviews.ts` next to `usePrIntent`, and shall type them with the synced `PrBriefResponse`.
U-3. [Ubiquitous] The system shall render `RiskAreas` inside the left column, directly under `IntentCard`, separated by a divider so the two read as one panel, as in the mock. If `IntentCard` needs a children slot for that, it is the only change to it. IF Intent is missing, `RiskAreas` still renders in that column.

Brief card (AC-28 to AC-37)

U-4. [State-driven] WHILE `usePrBrief` is loading, `PrBriefCard` shall show a skeleton the size of the banner. The Intent and Blast cards render independently.
U-5. [State-driven] WHILE `brief` is `null`, `PrBriefCard` shall show the "PR BRIEF" section label and an `EmptyState` with a **Generate brief** button (`ctaLoading` while pending), matching how `IntentCard` shows its empty state.
U-6. [State-driven] WHILE a generation is pending, both buttons shall be disabled and show a spinner, and the previous brief (if any) shall stay on screen with a "Generating…" label. The busy state ends when the mutation settles, not on a timer.
U-7. [State-driven] WHEN a brief exists and the PR has at least one review, the card shall use `VerdictBanner` with the latest review's `verdict`, `score`, finding count and blocker count, computed with the same derivation `FindingsTab` uses, and `summary = brief.summary`. IF the PR has no review, the card shall render a plain summary block in the same frame with no verdict icon, no score and no counts.
U-8. [Ubiquitous] The card shall show a **Refresh** icon button (accessible name "Regenerate brief") at the top right, and the cost line ("$0.014 8.2K→1.3K") under the score using `formatTokenCount`. IF `cost_usd` is null, it shall show the tokens and omit the price. It shall not show `$0`.
U-9. [State-driven] WHILE `stale` is true, the card shall show an inline notice "The PR changed since this brief was written" with a **Regenerate** action, and shall keep the content visible.
U-10. [State-driven] WHILE `data_gaps` contains `intent`, `blast` or `specs`, the card shall list what the brief was generated without, in a muted line, using new keys in the style of `unavailable` / `unavailableHint`. It shall not show `files_truncated` or `hunks_truncated` as errors (a muted "Large PR, partial view" note is enough).
U-11. [Unwanted behavior] IF the GET fails, the card shall show an inline error with Retry. IF the POST fails, it shall show the error text and keep the previous brief. Neither shall replace the Intent, Blast or Description cards.

Risk areas and Review focus (AC-32 to AC-36)

U-12. [Ubiquitous] `RiskAreas` shall show the `block.risks` label (value changed to "Risk areas"), then one row per risk: a kind icon in the severity colour, the title, the file links, and a chevron button that toggles the explanation (`aria-expanded`). Severity colours shall come from the shared `SEV`/tokens in `@devdigest/ui`, and shall not be redefined locally (the `SEV_COLOR` drift entry in `client/INSIGHTS.md`).
U-13. [Ubiquitous] Each row shall carry a visually hidden severity label from new keys ("High risk", "Medium risk", "Low risk"). Unknown `kind` values shall fall back to a generic warning icon. `kind` shall not be shown as raw text.
U-14. [Ubiquitous] A risk's file link shall display the ref as given (`path`, `path:n` or `path:n-m`), truncated in the middle for long paths with the full text in a `title`, and shall navigate like a Review-focus row (U-17). WHILE a ref's path is not in the PR files, it shall render as plain text.
U-15. [State-driven] WHILE `risks` is empty, `RiskAreas` shall show `brief.noRisks` and no rows.
U-16. [Ubiquitous] `ReviewFocus` shall show a full-width card labelled "Review focus — read these first" with a count badge, then rows numbered by order: a mono `file:line` link, an em dash, and the reason. It shall render nothing when the list is empty.

Navigation (AC-39 to AC-44)

U-17. [Event-driven] WHEN a link is activated, `page.tsx` shall call a new `openFile(file, line)` that pushes `?tab=diff&file=<encoded>&line=<n>` with `router.push` (the existing `setParam` uses `replace`, which would remove the Overview from history). `page.tsx` shall pass `file`, `line` and an `onArrived` callback to `DiffTab`.
U-18. [Ubiquitous] `DiffTab` shall, when `file` matches a file in `files` (exact match), force that file open, expand its Smart Diff group if collapsed, scroll its card into view (`scrollIntoView({ block: "start" })` inside `requestAnimationFrame`, after the file is expanded), set focus on the card header, and apply the highlight style (a 2px accent outline as in image 5). If `line` is valid for the file's parsed lines, it shall scroll that line into view instead. `FileCard` shall accept `forceOpen` and `highlight` props and a stable `id`/ref hook, without changing its default collapse rule for other files.
U-19. [Ubiquitous] The highlight shall clear on the next click outside the card, on a tab change, or on removal of `file` from the URL. Re-renders of the same `file`/`line` shall not scroll again (a ref remembers the handled key).
U-20. [Unwanted behavior] IF `file` is not in `files`, `DiffTab` shall show the normal tab and ignore the params. It shall not throw or show an error.
U-21. [Ubiquitous] The system shall treat `file` and `line` as untrusted: `line` is parsed as a positive integer and otherwise ignored, and `file` is only compared to the known paths, never used in a selector or inserted as HTML.
U-22. [Ubiquitous] The system shall keep working in Original order (the file is found without groups) and shall not switch the user's chosen order.

Layout and copy

U-23. [Ubiquitous] The Overview shall render, in order: `PrBriefCard`; a row with the left column (`IntentCard` + `RiskAreas`) and `BlastRadiusCard`, keeping the current `flex: "1 1 420px"` wrap so it stacks under about 900px; `ReviewFocus`; then `OverviewTab` (the description). The container keeps `maxWidth: 1080` from `page.tsx`.
U-24. [Ubiquitous] All new strings shall be keys in `messages/en/brief.json`. New keys (names are proposals): `block.brief`, `block.reviewFocus`, `generate`, `regenerate`, `regenerateAria`, `generating`, `stale`, `error`, `retry`, `summaryEmptyTitle`, `summaryEmptyBody`, `gaps.intent|blast|specs`, `gaps.largePr`, `severity.high|medium|low`, `focusCount`. `block.risks` changes from "Risks" to "Risk areas". The empty-state and `unavailable*` copy shall be reworded for the new "Generate" action. The planner shall check that no other file reads `block.risks` (today only `BlastRadiusCard.tsx:33` uses the namespace).
U-25. [Ubiquitous] Long titles, reasons and paths shall wrap or truncate without horizontal page scroll at phone width. Rows shall have a 16px side gutter and a touch target of at least 40px.

## Edge cases

- **Brief exists but Intent card shows "never derived".** Both are independent
  reads. This is allowed (AC-23).
- **Generating on the Overview, then switching tabs.** The mutation continues,
  the cache updates, and returning shows the result.
- **Refresh while `stale`.** One action, same as Refresh.
- **Click on a focus row while the diff data is still loading.** `DiffTab`
  waits for `files`, then arrives. The URL params persist (U-17, U-19).
- **A file inside a collapsed Boilerplate group** (image 2: package-lock).
  `forceOpen` expands the group and the card (U-18).
- **Back button** returns to Overview with the brief still cached (U-17).
- **Two review-focus rows for the same file.** Both link there. The second
  click re-scrolls because the handled key includes `line` (U-19).
- **Very many reviews.** The verdict comes from the newest one only.

## Non-functional requirements

Accessibility: buttons, not clickable divs; `aria-expanded` on risk rows;
focus moves on arrival (AC-43). No colour-only signals (U-13). Motion: the
scroll and highlight respect `prefers-reduced-motion` (no smooth scroll).
Performance: no new query on the Files tab. The brief query is fetched only
on the Overview.

## Inputs and provenance / Untrusted inputs

As SPEC-08. All brief strings are rendered as text (React escaping, no
`dangerouslySetInnerHTML`, no Markdown). The `file`/`line` params follow U-21.

## Tests (for `test-writer`)

- `helpers.test.ts` for the pure pieces: latest-review verdict and blocker
  counts, "is this path in the PR", handled-key logic, `file:line` label.
- `PrBriefCard.test.tsx` (RTL): empty → Generate → pending → ready; stale
  notice; error keeps the previous brief; no-review variant shows no score.
- `RiskAreas.test.tsx` / `ReviewFocus.test.tsx`: expand toggles
  `aria-expanded`, unknown path renders as text, click calls `openFile`.
- `DiffTab` arrival test: with `file`/`line`, the card is open and highlighted;
  unknown `file` is ignored.
- An e2e flow `specs/09-pr-brief.flow.json` is optional: the numbering rule is
  in the root `AGENTS.md`, and the flow needs a mocked or seeded LLM.

## Open questions

- **U-OQ-1.** Whether the "AI-generated from PR facts" line (SPEC-08 OQ-4) and
  the "reviewed at `abc1234`" note (OQ-3) ship in v1.
- **U-OQ-2.** The mock shows the Refresh icon in the banner even before any
  brief exists. This spec shows Generate in the empty state and Refresh only
  once a brief exists.
