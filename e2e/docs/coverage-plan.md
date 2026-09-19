# e2e coverage plan

What the 8 flows in `specs/` actually cover, and where the gaps are. This is
prose about coverage — the flows themselves (the executable spec) live in
`specs/*.flow.json`, per the note in `../AGENTS.md`.

## What's covered today

| Flow | Covers |
|------|--------|
| `01-app-boot` | Root redirect (`/` → `/pulls`) lands on the seeded repo's PR list. Smoke test that the whole stack (Postgres + API + web) actually boots and serves the seeded row (PR #482). |
| `02-repo-pulls-detail` | Clicking a PR row from the list navigates to its detail view and the detail view resolves against the same PR. |
| `03-agents` | The seeded reviewer agents (General, Security) render in the Agents list — confirms `db/seed.ts` agent rows reach the UI unmodified. |
| `04-pr-findings` | A PR with a persisted review shows its run verdict and findings list — the read path for `reviews`/`agent_runs` joined data. |
| `05-pr-diff` | The "Files changed" tab renders the seeded diff for `src/config.ts` — confirms the diff-rendering path independent of the findings path. |
| `06-onboarding` | The add-repository screen renders for a fresh/empty state. |
| `07-settings` | Settings page renders both the API Keys and Feature Models sections. |
| `08-pr-findings-severity` | Severity pills on a review run filter the visible findings list to the matching severity — the one flow that exercises client-side interactive filtering rather than pure render-and-read. |

All flows are read-only against seeded fixtures (`acme/payments-api`, PR #482,
the seeded agents) and assert via deterministic `wait --url` / `wait --text` —
no flow depends on model output, so none require an API key.

## What's NOT covered (by design or by gap)

- **Nothing here exercises a live review run.** Running a review calls an LLM
  (`reviewer-core` → OpenRouter), which is explicitly excluded by the "no LLM"
  invariant in `../AGENTS.md`. Coverage of the review pipeline itself
  (prompt assembly, grounding, scoring) belongs to `reviewer-core`'s own test
  suite, not here.
- **No write paths**: adding a repository, importing PRs, creating/editing an
  agent, saving settings. Flow `06` and `07` only assert that the *forms
  render*, not that a submit round-trips through the API and persists. Adding
  write-path coverage means either accepting non-determinism (a real GitHub
  clone in `06`) or stubbing the API, which this package's "real stack, no
  mocks" design does not currently support.
- **No auth/multi-workspace scenarios** — the local dev auth provider
  (`LocalNoAuthProvider`) is single-workspace by construction, so there is
  nothing to switch between.
- **No error states**: a failed review run, a 404 PR, a GitHub rate-limit —
  none of the seeded fixtures produce these, and no flow forces one.

## Adding new coverage

- New flow files are numbered in run order (`NN-name.flow.json`) — see the
  naming convention in `../AGENTS.md`.
- A new flow must stay read-only against the existing seed unless the seed
  itself is extended — see the "flows hardcode seeded fixture values" note in
  `../AGENTS.md` before changing anything in `server/src/db/seed.ts`.
- Prefer extending `lib/assert.ts` over inlining a new kind of check into a
  flow's `assert.stdoutIncludes`.
