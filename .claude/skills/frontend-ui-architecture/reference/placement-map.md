# Placement map — full reference

## Contents

- [Route-local UI](#route-local-ui)
- [Shared UI](#shared-ui)
- [UI primitives](#ui-primitives)
- [`constants.ts` vs `helpers.ts` vs `styles.ts`](#constantsts-vs-helpersts-vs-stylests)
- [Data access](#data-access)
- [`client/src/lib/` inventory](#clientsrclib-inventory)
- [Types](#types)
- [Copy / i18n](#copy--i18n)

## Route-local UI

A component used by exactly one route lives at
`app/<route>/_components/<PascalCase>/<PascalCase>.tsx`, with an `index.ts`
barrel. Examples: `app/agents/_components/AgentCard/`,
`app/repos/[repoId]/pulls/_components/FilterBar/`,
`app/repos/[repoId]/pulls/[number]/_components/FindingCard/`.

It nests as deep as the feature needs:
`app/agents/[id]/_components/AgentEditor/_components/ConfigTab/`,
`app/repos/[repoId]/pulls/[number]/_components/RunTraceDrawer/_components/`
holds six further sub-components.

## Shared UI

A component used by ≥2 routes lives at
`client/src/components/<kebab-case>/`. Two folder shapes coexist here:

- **Flat** (most common): `page-shell/`, `findings-popover/`,
  `run-cost-badge/`, `severity-filter-bar/`, `showcase/`,
  `mermaid-diagram/`, `repo-not-found/` — files sit directly in the folder,
  no `<Name>/` subfolder.
- **Nested** (`diff-viewer/` only): sub-components each get their own
  `<Name>/` folder (`CodeLine/`, `CommentCard/`, `FileCard/`, …) because the
  feature has enough internal structure to warrant it.

Use the flat shape by default; only nest when the shared component itself
decomposes into several named parts, the way `diff-viewer` does.

**Promotion rule:** move a `_components/<Name>/` folder to
`client/src/components/<kebab-case>/` in the same change that adds its
second real caller — not speculatively when writing the first consumer, and
never duplicate the code into the second route "for now." This is documented
in `client/INSIGHTS.md` (2026-09-18 entry) with three examples that already
followed it: `findings-popover`, `run-cost-badge`, `severity-filter-bar`.

## UI primitives

Never hand-roll a button, drawer, chart, badge, or other primitive. Check
`client/src/vendor/ui` (imported as `@devdigest/ui`) first. This is a
**derived, vendored copy** — `client/src/vendor/**` is generated from the
server's canonical copy and looks editable but is not; if a primitive is
missing, that's a signal to sync from `server/src/vendor/shared/`, not to
write a local replacement.

## `constants.ts` vs `helpers.ts` vs `styles.ts`

**`constants.ts`** — lookup maps, thresholds, magic numbers, tab/column key
lists, timings, geometry. Pure data, no functions beyond simple type
re-exports.

```ts
// app/agents/_components/AgentCard/constants.ts
export const MODEL_COLOR: Record<string, string> = {
  "gpt-4.1": "#3b82f6",
  "gpt-4o": "#10b981",
  ...
};
```

```ts
// app/repos/[repoId]/pulls/[number]/_components/FindingsPanel/constants.ts
export const LOW_CONFIDENCE_THRESHOLD = 0.65;
export const KEY_TO_ACTION: Record<string, FindingActionKind> = { a: "accept", d: "dismiss" };
```

**`helpers.ts`** — pure, testable functions, no React, importing from the
sibling `./constants`.

```ts
// app/repos/[repoId]/pulls/helpers.ts
import { SIZE_MEDIUM_MAX, SIZE_SMALL_MAX, type PrMeta, type SizeInfo } from "./constants";

export function sizeOf(pr: PrMeta): SizeInfo {
  const lines = pr.additions + pr.deletions;
  const size = lines < SIZE_SMALL_MAX ? "S" : lines < SIZE_MEDIUM_MAX ? "M" : "L";
  return { size, lines };
}
```

`client/src/components/findings-popover/helpers.ts` goes further: its
placement-math function is deliberately written to stay pure so it is
"testable without layout," and it has the tree's only colocated helper test
(`helpers.test.ts`).

**`styles.ts`** — a single `export const s = {...} as const` of
`CSSProperties` objects and style-factory functions. This is the project's
inline-style system (no CSS modules); values reference design tokens via
`var(--...)`.

```ts
// app/agents/_components/AgentCard/styles.ts
export const s = {
  card: (active: boolean, enabled: boolean): CSSProperties => ({
    border: "1px solid " + (active ? "var(--border-strong)" : "var(--border)"),
    ...
  }),
  headerRow: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  modelChip: (color: string): CSSProperties => ({ color, background: color + "1a", ... }),
} as const;
```

Static entries use `satisfies CSSProperties`; entries that depend on props
are factory functions; the whole object is `as const`.

## Data access

All server data flows through `client/src/lib/hooks/*`, built on `apiFetch`
(`client/src/lib/api.ts`). There is exactly one bare `fetch()` call in the
tree — inside `apiFetch` itself. A new page or component that needs API data
writes a hook here (or reuses an existing one), never a direct `fetch`.

```ts
// client/src/lib/hooks/core.ts
export function usePulls(repoId: string | null | undefined) {
  return useQuery({
    queryKey: ["pulls", repoId],
    queryFn: () => api.get<PrMeta[]>(`/repos/${repoId}/pulls`),
    enabled: !!repoId,
    refetchInterval: 60_000,
    refetchOnWindowFocus: true,
  });
}
```

Mutations add `useQueryClient()` and an `onSuccess` that invalidates or
patches the cache — see `hooks/core.ts`, `hooks/agents.ts`, `hooks/reviews.ts`
for the pattern. `hooks/reviews.ts` additionally owns the SSE subscription
(`useRunEvents`) — that fan-out logic belongs at the hook layer, not in a
component's `useEffect`.

## `client/src/lib/` inventory

Check this list before writing a new formatter, mapper, or provider — it
probably already exists:

| File | Purpose |
|---|---|
| `api.ts` | `apiFetch`, `ApiError`, the `api.{get,post,put,patch,del}` surface |
| `types.ts` | re-exports `@devdigest/shared` domain types + UI-only view types (e.g. `PrRowView`) |
| `format.ts` | `formatCost`, `formatSeconds`, `formatTokens`, `formatTokenCount` |
| `severity.ts` | `SEVERITY_ORDER`, `severityBuckets()`, `bySeverity()` |
| `feature-models.ts` | client-local mirror of a server model registry (kept local because importing runtime values from `vendor/shared` breaks webpack) |
| `github-urls.ts` | deep-link builders (`githubPrUrl`, …) |
| `model-label.ts` | model id → display label |
| `providers.tsx` | QueryClient defaults + global error→toast policy, nests Theme→Toast→Repo providers |
| `repo-context.tsx` | `RepoProvider`, `useActiveRepo()`, `useRepoNotFound()` |
| `theme.tsx` | `ThemeProvider`, `useTheme` |
| `toast.tsx` | `ToastProvider`, `notify` |
| `hooks/*` | all server-data hooks, see [Data access](#data-access) |

There is no `lib/constants.ts` — app-wide constants don't have a home yet
because none have needed one; don't create one speculatively.

## Types

Domain types (`Finding`, `Review`, `Severity`, …) come from
`@devdigest/shared` via `lib/types.ts` — never hand-roll one that mirrors a
Zod contract. UI-only types (toast state, color maps, view models like
`PrRowView`) belong in `lib/types.ts` if shared, or colocated with their one
consumer if not.

## Copy / i18n

All user-facing strings go through `next-intl`, keys in
`messages/en/<namespace>.json` (18 namespaces exist — check before adding a
19th). `constants.ts` files store i18n **key fragments**, not copy itself:
`STATUS_META[].labelKey`, `COLUMN_KEYS`, `VERDICT_META[].labelKey`. A
hardcoded string anywhere in a component — including inside
`window.confirm(...)` — is a violation; see
[anti-patterns.md](anti-patterns.md).
