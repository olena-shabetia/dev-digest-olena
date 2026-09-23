# client/ — @devdigest/web

Next.js 15 studio on :3000.

## Feature layout

Colocate a feature in `_components/<Name>/`: `<Name>.tsx` plus an `index.ts`
barrel. `styles.ts`, `constants.ts`, `helpers.ts` are OPTIONAL siblings — add one
only when it carries real content; never scaffold empty ones. Pages stay thin:
`page.tsx` composes, it holds no feature logic.

## Conventions

- Data flows ONLY through hooks in `src/lib/hooks/*` built on `apiFetch`. The
  tree currently has zero bare `fetch` calls — keep it that way. Errors arrive as
  `ApiError` carrying `status`; a network failure is `status: 0`.
- All user-facing strings go through `next-intl`, keys in
  `messages/<locale>/*.json`. No hardcoded copy in components.
- UI primitives come from `@devdigest/ui` (`src/vendor/ui`) — check that barrel
  before hand-rolling a button, drawer, or chart.
- `src/vendor/shared` is a DERIVED copy of the contracts. Change
  `server/src/vendor/shared/` first, then sync here.
- Domain types (`Finding`, `Review`, `Severity`, …) come from `@devdigest/shared`
  — never hand-roll one that mirrors a Zod contract. Local UI-only types
  (toast state, color maps) are fine.
- Tests run under vitest + jsdom with `fetch` mocked. Anything that needs a live
  server belongs in `../e2e`, not here.

## Read when

- Route map, and which endpoints a page pulls → `README.md`
- Server vs Client Component boundaries, where data fetching happens →
  `docs/ui-architecture.md`
- The full route table and what each page's data contract is →
  `specs/pages.md`
- Test strategy across the repo → `../TESTING.md`
- Implementing a lesson feature → `specs/<lesson>-<slug>.md` (write it first)
- A symptom feels familiar → `INSIGHTS.md`
