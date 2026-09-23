# server — DI and adapters architecture

How the API resolves the outside world (LLM providers, GitHub, secrets, git,
repo-intel) without any service ever calling `new` on an adapter directly.
For the module-internal layering convention (`routes → service → repository`),
see `../AGENTS.md`. For the full review-run lifecycle this container feeds
into, see `specs/review-flow.md`.

## The container

`src/platform/container.ts` defines `Container`, constructed as
`new Container(config, db, overrides: ContainerOverrides = {})`.

Three kinds of fields, by resolution timing:

- **Eager** — built in the constructor: `secrets` (`LocalSecretsProvider`),
  `auth` (`LocalNoAuthProvider`), `runBus`, `jobs` (`JobRunner`).
- **Lazy getters** — built on first access, cached after: `git`
  (`SimpleGitClient`), `agentsRepo`/`reviewRepo`, `codeIndex`
  (`RipgrepCodeIndex`), `repoIntel` (`RepoIntelService`), `depgraph`
  (`DepCruiseGraph`), `tokenizer` (`TiktokenTokenizer`), `priceBook`
  (live OpenRouter pricing, falls back to a static estimate).
- **Async resolvers** — methods, because building them needs an awaited
  secret lookup: `github()` (builds `OctokitGitHubClient` from
  `secrets.get('GITHUB_TOKEN')`), `llm(providerId)` (cached per provider id;
  builds `OpenAIProvider` / `AnthropicProvider` / the reviewer-core
  `OpenRouterProvider`), `embedder()` (throws before any OpenAI call when
  `EMBEDDINGS_ENABLED=false` — see `../AGENTS.md`).

Services always go through the container instance — `container.llm(id)`,
`container.github()`, `container.repoIntel` — never `new SomeAdapter()`
inline. This is what makes `ContainerOverrides` work: tests swap `secrets`,
`auth`, `github`, `git`, `codeIndex`, `embedder`, `llm` (a per-provider map),
`repoIntel`, `depgraph`, or `tokenizer` without touching the service under
test.

`invalidateSecretCaches()` clears the cached `llm`/`github`/`embedder`
instances after a secret is rotated via Settings — otherwise a stored key
change wouldn't take effect until process restart (see
`server/INSIGHTS.md` for the related "stored secret overrides `.env`" gotcha).

## Adapters (`src/adapters/**`)

Each implements an interface defined in `@devdigest/shared`
(`src/vendor/shared/adapters.ts`):

| Adapter | File | Implements |
|---|---|---|
| `LocalSecretsProvider` | `secrets/local.ts` | `SecretsProvider` |
| `LocalNoAuthProvider` | `auth/local.ts` | `AuthProvider` (single-workspace, no real auth) |
| `OctokitGitHubClient` | `github/octokit.ts` | `GitHubClient` |
| `OpenAIProvider` | `llm/openai.ts` | `LLMProvider` |
| `AnthropicProvider` | `llm/anthropic.ts` | `LLMProvider` |
| `SimpleGitClient` | `git/simple-git.ts` | `GitClient` |
| `RipgrepCodeIndex` | `codeindex/ripgrep.ts` | `CodeIndex` |
| `OpenAIEmbedder` | `embedder/openai.ts` | `Embedder` |
| `DepCruiseGraph` | `depgraph/index.ts` | `DepGraph` |
| `TiktokenTokenizer` | `tokenizer/index.ts` | `Tokenizer` |

`llm/pricing.ts` holds a static USD/1M-token table and `estimateCost(model,
tokensIn, tokensOut)`, returning `null` for an unlisted model — the fallback
path when `PriceBook`'s live OpenRouter pricing isn't available.

The `OpenRouterProvider` used by `llm('openrouter')` is NOT under
`server/src/adapters` — it lives in `@devdigest/reviewer-core`, shared
between the studio and the CI runner (`container.ts`).

## Module layering, and where it's incomplete

`routes.ts → service.ts → repository.ts → helpers.ts/constants.ts` (see
`../AGENTS.md`) is fully present in `src/modules/reviews/`: `routes.ts` →
`service.ts` → `repository/{pull,review,run}.repo.ts`, plus
`run-executor.ts`, `diff-loader.ts`, `findings.ts` as focused helpers.

`src/modules/pulls/` only has `repository.ts` / `routes.ts` / `status.ts` — no
`service.ts`. Per `../INSIGHTS.md`, this module's route handler used to run
inline aggregate SQL directly (`GET /repos/:id/pulls`); the query was
extracted into `repository.ts` (`reviewAggregatesByPr`) when L01 needed a
second aggregate, but the module still has no service layer separating HTTP
from business logic. Treat it as the one module lagging the convention —
sweep it before adding more logic on top.

## workspace_id scoping

Every domain query is scoped by `workspace_id`. Example,
`src/modules/reviews/repository/run.repo.ts`, `activeRunsForPull`:

```ts
.where(and(
  eq(t.agentRuns.workspaceId, workspaceId),
  eq(t.agentRuns.prId, prId),
  eq(t.agentRuns.status, 'running'),
))
```
