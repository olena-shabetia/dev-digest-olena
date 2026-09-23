# client — UI architecture

Where Server vs Client Components split, and how data actually reaches a
page. For the route map itself, see `specs/pages.md`. For the
feature-colocation folder convention, see `../AGENTS.md`.

## Server/Client boundary

The root layout (`src/app/layout.tsx`) is the one meaningful Server
Component in the tree: it's `async`, calls `getLocale()`/`getMessages()`
(next-intl server APIs) directly, and feeds the result into
`<NextIntlClientProvider>`. That's server-side fetching of i18n message
bundles, not app data — it doesn't fetch anything from `@devdigest/api`.

Every page that shows API-backed data is a Client Component, in one of two
shapes:

1. **Page itself is the client boundary** — `page.tsx` opens with
   `"use client"` and calls hooks directly (`src/app/page.tsx`,
   `.../pulls/page.tsx`, `.../pulls/[number]/page.tsx`).
2. **Page is a thin Server Component wrapper around a client view** —
   `src/app/agents/page.tsx` and `src/app/settings/[section]/page.tsx` carry
   no `"use client"` themselves, but render `AgentsListView` /
   `SettingsView`, which do declare `"use client"` and own the data fetching.

Either way, the actual data fetching is never inline in a Server Component —
it goes through `src/lib/hooks/*`, which call `apiFetch`
(`src/lib/api.ts`). A repo-wide grep for bare `fetch(` turns up exactly one
call site: inside `apiFetch` itself. The claim in `../AGENTS.md` — "data
flows only through hooks" — holds for every actual data-fetching page in the
tree.

**Rule:** a new page that needs API data should default to shape 1 (page
itself is `"use client"`) unless it has non-trivial layout composition that
benefits from staying a Server Component wrapper — in which case push the
`"use client"` boundary down into a `_components/<Name>View` like
`AgentsListView`/`SettingsView` do, never fetch inside the Server Component.

## Feature colocation in practice

A `_components/<Name>/` folder is: `<Name>.tsx`, `index.ts` barrel, and only
the optional siblings that carry real content.

- `src/app/agents/_components/AgentCard/` uses all four: `AgentCard.tsx`,
  `index.ts` (`export { AgentCard, AgentCard as default }`), `constants.ts`
  (`MODEL_COLOR` map), `styles.ts`, `helpers.ts` (`modelColor()`), plus its
  own test file.
- `src/app/repos/[repoId]/pulls/_components/FindingsCell/` only needed
  `FindingsCell.tsx`, `styles.ts`, `index.ts` — no `constants.ts`/
  `helpers.ts`, because none carried real content. This is the "optional
  siblings" rule in `../AGENTS.md` in effect, not an oversight.
- `AgentsListView/` additionally nests its own `_components/` subfolder for
  the create-agent modal — colocation nests as deep as a feature actually
  needs, it isn't flattened to one level.

## The shared `client/src/components/` layer

Promoted once a second route needs the same component (see the promotion
rule in `../INSIGHTS.md`). Currently: `app-shell/`, `page-shell/`,
`repo-not-found/` (app-level shell/layout), `diff-viewer/`,
`mermaid-diagram/` (viewers), and the three components promoted during L01/L02
— `findings-popover/`, `run-cost-badge/`, `severity-filter-bar/` — plus
`showcase/`.

**Rule:** do not add a new folder here speculatively. Per `../INSIGHTS.md`,
promotion happens in the same change that adds the second real caller — not
before.

## `@devdigest/ui` and `@devdigest/shared`

- `src/vendor/ui/index.ts` barrels: `icons`, `primitives` (Button, Card,
  Badge, Chip, Skeleton, EmptyState, ErrorState, ProgressBar, CircularScore,
  Markdown, …), `kit` (TextInput, SelectInput, Dropdown, Drawer, Modal, Tabs,
  FormField, …), `charts`, `nav`, `shell`, `command-palette`, plus
  standalone exports (`LiveLogStream`, `ExportWizardSteps`,
  `AutoTriggerStatus`). Check this barrel before hand-rolling a UI primitive.
- `src/vendor/shared/index.ts` re-exports the Zod contracts (findings,
  review-api, brief, knowledge, trace, platform, why, eval-ci,
  observability, productionize, adapters). Hooks import types directly from
  it, e.g. `src/lib/hooks/agents.ts` (`Agent`, `ModelInfo`, `Provider`,
  `ReviewStrategy`). This copy is DERIVED — see the vendor-sync rule in
  `../AGENTS.md` and the drift note in `../INSIGHTS.md` before editing it.

## i18n

`next.config.mjs` wraps the config with `createNextIntlPlugin("./src/i18n/request.ts")`.
`src/i18n/request.ts` hardcodes a single locale (`en` — no locale routing or
middleware) and merges every `messages/en/<namespace>.json` file into one
namespaced messages object. Client components read from it via
`useTranslations("<namespace>")`.
