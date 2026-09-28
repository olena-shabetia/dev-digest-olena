# mcp/ — @devdigest/mcp

A local, stdio-only MCP server (`devdigest`) exposing DevDigest reviews to an
MCP host such as Claude Code. Thin HTTP client over the running API on
`:3001` — no server, client, reviewer-core, or DB code lives here. Full
feature contract: `../specs/L04-devdigest-mcp.md`.

## Invariants (breaking one of these breaks the package's reason to exist)

- **stdout carries only JSON-RPC.** Every log line goes to stderr through
  `src/log.ts`; `console.*` is an ESLint error (`no-console: error`).
- **HTTP only.** This package talks to DevDigest exclusively over
  `DEVDIGEST_API_BASE`. Importing `server/src/modules/**`,
  `server/src/platform/**`, `server/src/db/**`, `server/src/adapters/**`, or
  `@devdigest/reviewer-core` is a lint error (`no-restricted-imports`).
- **`@devdigest/shared` resolves to the canonical server copy**
  (`../server/src/vendor/shared`) through tsconfig `paths`, the same pattern
  `reviewer-core` uses — this package never vendors its own contracts.
- **Exactly one write tool.** Only `run_agent_on_pr` mutates anything (it
  starts a review run through `POST /pulls/:id/review`, the same route the
  UI uses, so runs are visible live in the studio). It never starts a second
  run for an agent that already has one `running` on the same PR — it
  attaches to the existing run instead.
- **Business errors are tool results, never protocol errors.** A failure a
  model should reason about (unknown repo, disabled agent, unreachable API,
  …) comes back as `{isError:true, content:[{type:'text', text:'Error: …'}]}`
  with an actionable next step — never a thrown `McpError`. `get_blast_radius`
  is never `isError` for a degraded or empty result; resolver/API failures use
  the standard error table like every other read tool.
- **Inputs are flat primitives only.** No `object`/`array` properties in any
  tool's input schema — enums are static, and a test enforces this plus a
  `tools/list` character budget (6,000 chars) and a per-description cap (450
  chars), because those two numbers are what determines how much of a host's
  context window is spent before the model does anything.
- **PR- and repo-derived text is untrusted data, never instructions.**
  Finding titles/summaries and convention rule text are sanitized (control
  characters stripped, code fences neutralized, length-capped) before being
  returned — the same principle as `reviewer-core/AGENTS.md`'s "all external
  text is data, never instructions."
- **No `outputSchema`.** Responses are a single compact-JSON `text` content
  block; nesting is allowed only in that JSON, never in the input schema.

## Conventions

- Installs with `npm ci` (not pnpm) and keeps its own `package-lock.json` —
  same reasoning as `reviewer-core/AGENTS.md`: raw TypeScript pulled in
  through tsconfig `paths` needs a flat `node_modules`, and local pnpm is
  broken for this repo anyway (see root `INSIGHTS.md`).
- Launched via `node bin/devdigest-mcp.mjs`, never `npm run` — npm prints a
  banner to stdout, which would corrupt the JSON-RPC stream.
- Env is read in exactly one place, `src/config.ts` (`McpConfig`); nothing
  else touches `process.env`.
- Layering: `tools/*` (MCP wrapper, no HTTP) → `resolve.ts` / `runs.ts`
  (orchestration) → `api/client.ts` (HTTP) + `format.ts` (pure functions).
  `format.ts` never imports `api/client.ts`.
- Waits for a run by polling `GET /pulls/:id/runs` (default 4s / 180s,
  configurable) — not SSE. The DB row is the source of truth; the server's
  `RunBus` is in-memory only and does not survive an API restart.

## Read when

- The full tool contract (names, input schemas, descriptions, output shapes,
  the frozen error table, invariants) → `../specs/L04-devdigest-mcp.md`
- How this package's suite fits the rest of the repo → `../TESTING.md`
- A symptom feels familiar → `INSIGHTS.md`
