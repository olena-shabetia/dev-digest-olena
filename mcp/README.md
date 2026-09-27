# mcp/ — @devdigest/mcp

A local, **stdio-only** [MCP](https://modelcontextprotocol.io) server named
`devdigest`. It lets an MCP host (Claude Code, or any other MCP client) drive
DevDigest reviews without the web UI — it is a thin client over the running
Fastify API on `:3001`; no server/db code lives here. Full contract (tool
schemas, output shapes, error table): [`../specs/L04-devdigest-mcp.md`](../specs/L04-devdigest-mcp.md).
Package conventions and invariants: [`AGENTS.md`](AGENTS.md).

## Prerequisites

The DevDigest stack must already be running (this package only talks HTTP
to it, it never starts it):

```sh
./scripts/dev.sh
```

## Install

npm, not pnpm — same reasoning as `reviewer-core/` (see its `AGENTS.md`):

```sh
cd mcp && npm ci
```

## Register with Claude Code

The repo's root [`.mcp.json`](../.mcp.json) already declares the `devdigest`
server (stdio, `node mcp/bin/devdigest-mcp.mjs`). From the repo root:

```sh
claude mcp list
```

approve `devdigest` when prompted. You can also try it standalone with the
[MCP Inspector](https://github.com/modelcontextprotocol/inspector):

```sh
cd mcp && npm run inspect
```

## Configuration (env vars)

| Var                             | Default                 | Meaning                                                                                |
| ------------------------------- | ----------------------- | -------------------------------------------------------------------------------------- |
| `DEVDIGEST_API_BASE`            | `http://localhost:3001` | Base URL of the DevDigest API                                                          |
| `DEVDIGEST_MCP_RUN_TIMEOUT_MS`  | `180000`                | Max time `run_agent_on_pr` waits for a run before returning `status:"running"`         |
| `DEVDIGEST_MCP_POLL_MS`         | `4000`                  | Polling interval against `GET /pulls/:id/runs`                                         |
| `DEVDIGEST_MCP_HTTP_TIMEOUT_MS` | `15000`                 | Per-request HTTP timeout (doubled for `GET /repos/:id/pulls`, which syncs with GitHub) |

All are read once, in `src/config.ts`.

## Tools

Exactly five, all flat-primitive inputs, no `outputSchema`:

| Tool               | Input                                                       | Returns                                                    | Side effects                                                       |
| ------------------ | ----------------------------------------------------------- | ---------------------------------------------------------- | ------------------------------------------------------------------ |
| `list_agents`      | —                                                           | configured reviewer agents                                 | none                                                               |
| `run_agent_on_pr`  | `repo`, `pr`, `agent`, `severity?`, `limit?`                | review result, or `status:"running"` + `run_id` on timeout | creates a run (visible live in the DevDigest UI), spends LLM money |
| `get_findings`     | `run_id?` or `repo`+`pr` (+`agent?`), `severity?`, `limit?` | review result of a finished run                            | none                                                               |
| `get_conventions`  | `repo`, `status?`, `limit?`                                 | extracted house conventions                                | none                                                               |
| `get_blast_radius` | `repo`, `pr`                                                | `{status:"not_implemented"}`                               | none (stub; real implementation is later coursework)               |

`run_agent_on_pr` and `get_findings` share one response shape: verdict,
score, blockers, and up to `limit` (default 10, max 50) findings, most severe
first. Business errors (unknown repo, disabled agent, unreachable API, …)
come back as a normal tool result with `isError:true` and a next step, never
a protocol error — see the frozen error table in the spec.

## Useful scripts

`npm run start` (launch via `node bin/devdigest-mcp.mjs`) · `npm run
typecheck` · `npm run lint` · `npm test` · `npm run inspect` (MCP Inspector).

## Testing

See [`../TESTING.md`](../TESTING.md) for how this suite fits the rest of the
repo. Run locally with:

```sh
cd mcp && npm test
```
