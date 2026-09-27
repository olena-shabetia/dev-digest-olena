// Business-error taxonomy for the tool layer. These are NEVER thrown as
// `McpError` (the SDK's protocol-level error) — `McpError` stays reserved for
// input the SDK itself rejects before a handler ever runs (frozen in the
// plan, §3.5). Every code below maps to a frozen, human-actionable message
// so a calling agent has a next step, not just a failure.
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export type ToolErrorCode =
  | 'api_unreachable'
  | 'repo_not_found'
  | 'pr_not_imported'
  | 'agent_not_found'
  | 'agent_ambiguous'
  | 'agent_disabled'
  | 'run_failed'
  | 'run_cancelled'
  | 'run_unknown'
  | 'no_completed_review'
  | 'rate_limited'
  | 'db_not_ready'
  | 'bad_input'
  | 'api_error'
  | 'unexpected_shape';

/** A fully-formatted, user-facing tool error. `message` already has every
 *  `<…>` placeholder from the plan's error table substituted by the thrower. */
export class ToolError extends Error {
  constructor(
    message: string,
    public readonly code: ToolErrorCode,
  ) {
    super(message);
    this.name = 'ToolError';
  }
}

/** A non-2xx HTTP response from the DevDigest API, with the parsed
 *  `{error:{code,message}}` envelope when the body had one. */
export class ApiHttpError extends Error {
  status: number;
  code?: string;
  path: string;
  constructor(message: string, opts: { status: number; code?: string; path: string }) {
    super(message);
    this.name = 'ApiHttpError';
    this.status = opts.status;
    this.code = opts.code;
    this.path = opts.path;
  }
}

/** The API could not be reached at all: network failure, connection refused,
 *  or the request timed out. */
export class ApiUnreachableError extends Error {
  apiBase: string;
  constructor(message: string, apiBase: string) {
    super(message);
    this.name = 'ApiUnreachableError';
    this.apiBase = apiBase;
  }
}

const DB_NOT_READY_PATTERN =
  /pnpm db:seed|pnpm db:migrate|relation .* does not exist|does not exist/i;

function textResult(message: string): CallToolResult {
  return { isError: true, content: [{ type: 'text', text: `Error: ${message}` }] };
}

/** Converts any error the tool layer can throw into the frozen `CallToolResult`
 *  shape (§3.5). Every branch here is a literal from that table — do not
 *  reword without updating the plan's contract freeze first. */
export function toErrorResult(err: unknown, apiBase: string): CallToolResult {
  if (err instanceof ToolError) {
    return textResult(err.message);
  }

  if (err instanceof ApiUnreachableError) {
    return textResult(
      `DevDigest API not reachable at ${apiBase}. Start it with ./scripts/dev.sh (see README.md), then retry.`,
    );
  }

  if (err instanceof ApiHttpError) {
    if (err.status === 429) {
      return textResult('DevDigest rate limit hit (reviews: 10/min). Wait ~60s and retry.');
    }
    if (err.status >= 500 && DB_NOT_READY_PATTERN.test(err.message)) {
      return textResult(
        `DevDigest database not ready: ${err.message}. Run: cd server && pnpm db:migrate && pnpm db:seed, then restart the API.`,
      );
    }
    return textResult(`DevDigest API error ${err.status} ${err.code ?? 'unknown'}: ${err.message}`);
  }

  const message = err instanceof Error ? err.message : String(err);
  return textResult(message);
}
