---
name: frontend-ui-architecture
version: 1.0.0
description: >-
  Decides where frontend code belongs in the DevDigest client and who may
  import it — which folder a component, hook, constant, style, helper or
  type goes in, when to split a component into siblings or a nested
  _components/ folder, when to promote route-local code to the shared
  layer, and where business logic lives. Use before creating any new file
  under client/, when a component or page is growing, when choosing
  between a route-local and a shared component, when a helper or constant
  needs a home, or when reviewing a change for structural drift. Does NOT
  cover React internals, hooks rules, state, or rendering (see
  react-best-practices) or Next.js framework file conventions inside app/
  (see next-best-practices).
---

# Frontend UI Architecture

This skill answers one question: **where does this file go, and who is
allowed to import it?** It is scoped to placement and organization only.

| Question | Answer lives in |
|---|---|
| Where does this file go / who imports it | this skill |
| Should this be state, memo, effect, derived | `react-best-practices` |
| `page`/`layout`/`loading`, route groups, dynamic segments | `next-best-practices` |
| Server vs Client Component *data* rules | `client/docs/ui-architecture.md` |

## Placement table

| Kind of code | Goes in |
|---|---|
| UI used by exactly one route | `app/<route>/_components/<PascalCase>/` |
| UI used by ≥2 routes | `client/src/components/<kebab-case>/` |
| UI primitive (button, badge, chart) | **don't write one** — check the `@devdigest/ui` barrel first |
| Server data access | `client/src/lib/hooks/*` over `apiFetch` — never a bare `fetch` |
| Pure derivation/formatting, feature-scoped | sibling `helpers.ts` |
| Pure derivation, app-wide | `client/src/lib/*.ts` (`format.ts`, `severity.ts`, `github-urls.ts`) |
| Thresholds, maps, timings, geometry | nearest `constants.ts` sibling |
| Inline style objects | sibling `styles.ts`, `export const s = {...} as const` |
| Domain types | `@devdigest/shared` via `lib/types.ts` — never hand-rolled |
| UI-only view types | `lib/types.ts` or colocated with the one consumer |
| User-facing copy | `messages/en/<namespace>.json`; constants hold *key fragments* only |
| Cross-cutting policy (errors, theme, toast, active repo) | `client/src/lib/*.tsx` providers |

Full table with real examples and the `constants.ts`/`helpers.ts`/`styles.ts`
distinction: [reference/placement-map.md](reference/placement-map.md).

## Folder shapes

A `_components/<Name>/` folder is `<Name>.tsx` + an `index.ts` barrel.
`styles.ts`, `constants.ts`, `helpers.ts` are optional siblings — add one
only when it carries real content. **Never scaffold an empty one.** Every
folder still needs its `index.ts`, though — `RunHistory/` in this tree is
missing one and should not be copied as a pattern.

Nesting goes as deep as the feature needs, it is not flattened to one level:
`RunTraceDrawer/_components/`, `AgentsListView/_components/CreateAgentModal/`.

## When to split

- Extract `constants.ts` / `helpers.ts` / `styles.ts` the moment the
  component body would otherwise hold a lookup map, a pure function, or an
  inline style object — not before.
- Extract a nested `_components/<Child>/` when a JSX subtree earns its own
  name and could be tested in isolation.
- Size and prop-count limits for splitting a component are
  `react-best-practices`' territory — this skill only says *where* the
  split lands, not *when* a component is too big.

## Business-logic ladder

Logic sinks as far down this ladder as it can go:

1. **Server** (`server/src/modules/*`) — derived domain fields,
   orchestration, anything an LLM or the DB produces. The client never
   recomputes them.
2. **`lib/hooks/*`** — server state, cache coherence, invalidation graphs,
   polling cadence, SSE.
3. **`helpers.ts`** — pure, React-free, testable without layout.
4. **Component body** — composition and event wiring only.

Real leaks to *not* copy: the filter/sort pipeline inline in
`pulls/page.tsx` instead of `helpers.ts`, and the invalidation callbacks +
findings derivation inline in `pulls/[number]/page.tsx` instead of hooks.
See [reference/anti-patterns.md](reference/anti-patterns.md) for exact
lines and fixes.

## Import direction

```
vendor (@devdigest/ui, @devdigest/shared)
  ← lib/  ←  components/  ←  app/<route>/_components/  ←  app/<route>/page.tsx
```

- A route's `_components/` may never be imported by another route —
  **promote** to `client/src/components/<kebab-case>/` instead, and do it
  in the same change that adds the second caller. Never promote
  speculatively, never duplicate "for now."
- `client/src/vendor/**` is a generated, derived copy. Edit
  `server/src/vendor/shared/` first, then sync — never author here.

Full rules, including barrel policy: [reference/boundaries.md](reference/boundaries.md).

## Before adding any file under `client/`

- [ ] Does this UI already exist in the `@devdigest/ui` barrel?
- [ ] Is this the second consumer of a `_components/` folder? → promote it now,
      in this change.
- [ ] Am I about to write a color/severity map? → grep for `SEV[` /
      `SeverityBadge` first; a new `Record<Severity, string>` outside
      `tokens.ts` is a bug, not a one-off.
- [ ] Is this business logic? → walk the ladder above before it lands in a
      component body.
- [ ] Does this component/page fetch data? → through `lib/hooks/*`, never a
      bare `fetch`.
- [ ] Am I adding a sibling file? → only if it has real content; don't
      scaffold empties.
- [ ] User-facing string? → `next-intl` key, not a literal.

## Reference

- [reference/placement-map.md](reference/placement-map.md) — full "where does
  X go" table with real file examples.
- [reference/boundaries.md](reference/boundaries.md) — promotion rule, import
  direction, barrel policy, vendor-sync rule.
- [reference/anti-patterns.md](reference/anti-patterns.md) — real drift in
  this tree, with file:line and the fix.
- `client/AGENTS.md` — feature layout and conventions this skill expands on.
- `client/docs/ui-architecture.md` — Server/Client Component boundary rules.
- `client/INSIGHTS.md` — the promotion rule and the `SEV_COLOR` drift story
  in full.
