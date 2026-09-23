# Boundaries — promotion, import direction, barrels

## Promotion rule

Promote a page-local component to the shared `client/src/components/` layer
**exactly when a second page needs it — not before, not after.**

> promote a page-local component to `client/src/components/` on its second
> consumer, not before ... promoting on the first write means guessing at a
> shared shape before a second real caller exists to validate it; duplicating
> past the second caller means the two copies silently drift.
> — `client/INSIGHTS.md`, 2026-09-18

Concretely: when a `_components/<Name>/` folder's contents are about to be
needed by a second route, move it to `client/src/components/<kebab-case>/`
**in the same change** that adds the second usage. Don't duplicate "for now"
and don't pre-promote "in case." `findings-popover`, `run-cost-badge`, and
`severity-filter-bar` were all promoted at exactly this trigger point.

## Import direction

```
vendor (@devdigest/ui, @devdigest/shared)
  ← lib/  ←  components/  ←  app/<route>/_components/  ←  app/<route>/page.tsx
```

Reading it as rules:

- `lib/` may import only from `vendor/`.
- `components/` (the shared layer) may import from `lib/` and `vendor/`, never
  from anything under `app/`.
- `app/<route>/_components/` may import from `components/`, `lib/`, and
  `vendor/`, and from its own route's siblings — never from another route's
  `_components/`. If two routes need the same component, that's the
  promotion trigger above, not a cross-route import.
- `page.tsx` composes; it should hold no feature logic of its own (see the
  business-logic ladder in `SKILL.md` and the leaks documented in
  [anti-patterns.md](anti-patterns.md)).

## Vendor sync rule

`client/src/vendor/shared` and `client/src/vendor/ui` are **derived, not
canonical**. The server's copies (`server/src/vendor/shared/`) are the source
of truth because Next.js cannot import across the package root, so
`@devdigest/shared` is vendored twice. Before editing anything under
`client/src/vendor/`, diff it against the server copy. Change the server
copy first, then sync here — otherwise the gap widens silently (this has
already happened once: `client/INSIGHTS.md`, 2026-09-17 entry, five files
drifted).

## Barrel policy

`index.ts` is a **public-API boundary**, not an import convenience. Rules:

1. Every component folder gets exactly one `index.ts` that re-exports its
   intended public surface — not necessarily everything in the folder.
   `client/src/components/diff-viewer/index.ts` deliberately narrows to two
   exports (`DiffViewer`, `DiffCommentApi`) even though the folder contains
   many internal sub-components.
2. Never import through a folder's own barrel from *inside* that folder —
   that's how circular imports start, and they surface as confusing
   "Cannot access 'X' before initialization" errors. Sibling files import
   each other directly (`./helpers`, `./constants`), not via `./index`.
3. A missing `index.ts` breaks the promotion contract silently — every
   `_components/<Name>/` folder needs one even if it currently has only one
   consumer, so promotion later is a move, not a refactor. (`RunHistory/` in
   this tree currently lacks one; don't copy that.)

## Where the Server/Client Component boundary goes

This skill does not own RSC/data-fetching rules — see
`client/docs/ui-architecture.md` for the full policy (the root layout is the
one meaningful Server Component; every page showing API-backed data is a
Client Component, either directly or via a thin Server wrapper around a
`_components/<Name>View`) and `next-best-practices` for the framework's
special-file conventions inside `app/`. What this skill adds on top: whichever
shape a page takes, the component **files** inside it still follow the
placement rules above — a Server-wrapped page's `<Name>View` is still a
route-local `_components/` folder until it has a second caller.
