import { describe, it, expect } from 'vitest';
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';
import { toErrorResult, ToolError, ApiHttpError, ApiUnreachableError } from '../src/errors.js';

const API_BASE = 'http://localhost:3001';

/** Every result here is built with a single `{type:'text', ...}` content
 *  block; narrow it so tests can read `.text` without fighting the SDK's
 *  content union type. */
function textOf(result: CallToolResult): string {
  const block = result.content[0];
  if (!block || block.type !== 'text') throw new Error('expected a text content block');
  return block.text;
}

describe('toErrorResult', () => {
  it('formats a ToolError as isError:true with "Error: <message>"', () => {
    const result = toErrorResult(
      new ToolError(
        "Agent 'nope' not found. Call list_agents for valid names or ids.",
        'agent_not_found',
      ),
      API_BASE,
    );
    expect(result.isError).toBe(true);
    expect(result.content).toEqual([
      {
        type: 'text',
        text: "Error: Agent 'nope' not found. Call list_agents for valid names or ids.",
      },
    ]);
  });

  it('formats ApiUnreachableError with the frozen api_unreachable message naming the API base', () => {
    const result = toErrorResult(new ApiUnreachableError('fetch failed', API_BASE), API_BASE);
    expect(result.content[0]).toEqual({
      type: 'text',
      text: 'Error: DevDigest API not reachable at http://localhost:3001. Start it with ./scripts/dev.sh (see README.md), then retry.',
    });
  });

  it('maps a 429 ApiHttpError to the rate_limited message', () => {
    const result = toErrorResult(
      new ApiHttpError('Too many requests', { status: 429, path: 'POST /pulls/x/review' }),
      API_BASE,
    );
    expect(result.content[0]).toEqual({
      type: 'text',
      text: 'Error: DevDigest rate limit hit (reviews: 10/min). Wait ~60s and retry.',
    });
  });

  it('maps a 5xx ApiHttpError whose message mentions db:seed to db_not_ready', () => {
    const result = toErrorResult(
      new ApiHttpError('No default workspace found — run pnpm db:seed', {
        status: 500,
        path: 'GET /repos',
      }),
      API_BASE,
    );
    expect(result.content[0]).toEqual({
      type: 'text',
      text: 'Error: DevDigest database not ready: No default workspace found — run pnpm db:seed. Run: cd server && pnpm db:migrate && pnpm db:seed, then restart the API.',
    });
  });

  it('maps a 5xx ApiHttpError whose message mentions "relation ... does not exist" to db_not_ready', () => {
    const result = toErrorResult(
      new ApiHttpError('relation "agents" does not exist', { status: 500, path: 'GET /agents' }),
      API_BASE,
    );
    expect(textOf(result)).toContain('DevDigest database not ready');
  });

  it('falls back to the generic api_error message for other non-2xx responses', () => {
    const result = toErrorResult(
      new ApiHttpError('Internal error', {
        status: 503,
        code: 'internal_error',
        path: 'GET /agents',
      }),
      API_BASE,
    );
    expect(result.content[0]).toEqual({
      type: 'text',
      text: 'Error: DevDigest API error 503 internal_error: Internal error',
    });
  });

  it('falls back to the raw message for an unrecognized error type', () => {
    const result = toErrorResult(new Error('boom'), API_BASE);
    expect(result.isError).toBe(true);
    expect(result.content[0]).toEqual({ type: 'text', text: 'Error: boom' });
  });
});
