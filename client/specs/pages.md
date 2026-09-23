# spec: routes and page data

The route map and what each page depends on. If a route is renamed or its
data source changes, update this file in the same change — this is what
`../AGENTS.md`'s "Read when" table points to for "what does this page show
and where does its data come from."

| Route | File | Shows | Data source |
|---|---|---|---|
| `/` | `src/app/page.tsx` | Redirect shell — sends to the first repo's PR list, or `/onboarding` if there is no repo yet | `useRepos()` |
| `/onboarding` | `src/app/onboarding/page.tsx` | Add-repository wizard | `AddRepoView` (client) |
| `/repos/[repoId]/pulls` | `src/app/repos/[repoId]/pulls/page.tsx` | PR list for a repo; filters/sort kept in the query string | `usePulls`, `useRefreshRepo` |
| `/repos/[repoId]/pulls/[number]` | `.../pulls/[number]/page.tsx` | PR detail: overview / findings / diff tabs, run-review dropdown, live run status over SSE, run-trace drawer | `usePullDetail`, `usePulls`, `usePrReviews`, `useCancelRun` |
| `/agents` | `src/app/agents/page.tsx` | List of reviewer agents | `AgentsListView` (client view rendered by a thin Server Component page) |
| `/agents/[id]` | `src/app/agents/[id]/page.tsx` | Agent editor — model + system prompt, tabs via `?tab=` | client-side hooks inside the editor view |
| `/skills` | `src/app/skills/page.tsx` | Skills master-detail shell — list + a 5-tab skill editor (Config/Preview/Evals/Stats/Versions) in the right pane; no nested route per skill, tab state lives in the client view | `SkillsListView` (client view rendered by a thin Server Component page) |
| `/settings/[section]` | `src/app/settings/[section]/page.tsx` | Settings sections (API Keys, Feature Models, …) | `SettingsView` (client view rendered by a thin Server Component page) |

Root layout: `src/app/layout.tsx` — Server Component, resolves i18n
(`getLocale`/`getMessages`) and wraps everything in
`<NextIntlClientProvider>`. It does not fetch app data.

## Contract this file protects

- Every route above that shows API-backed data fetches through
  `src/lib/hooks/*` (built on `apiFetch`) — never a direct `fetch()` in a
  page or view. See `../docs/ui-architecture.md` for the Server/Client
  Component split this implies.
- `/` must always resolve to either a real repo's PR list or `/onboarding` —
  never a dead end. If a new "zero repos" or "zero PRs" state is added, it
  must be handled at this redirect, not deep inside the PR list page.
- `/repos/[repoId]/pulls/[number]` is the one page with a live/streaming
  dependency (SSE run status via `useCancelRun`/run hooks) — a change here
  needs manual testing against an in-progress run, not just a static-data
  check, because vitest + jsdom (per `../AGENTS.md`) mocks `fetch`, not SSE.
- `e2e/specs/*.flow.json` hardcode these routes against seeded fixture data
  (`acme/payments-api`, PR #482) — renaming a route or changing what a page
  requires as a precondition will silently break flows in `../../e2e`; check
  that suite before renaming anything here.
