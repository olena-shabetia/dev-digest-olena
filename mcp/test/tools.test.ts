// Exercises the 5 tools through the real MCP protocol (InMemoryTransport +
// Client), not by calling handlers directly — so schema validation,
// annotations, and the exact content shape are covered too (plan §5 WU-7
// step 6).
import { describe, it, expect } from 'vitest';
import type { Client } from '@modelcontextprotocol/sdk/client/index.js';
import type { ConventionCandidate, ConventionScan } from '@devdigest/shared';
import { DevDigestApi } from '../src/api/client.js';
import { Resolver } from '../src/resolve.js';
import { RunRegistry } from '../src/runs.js';
import type { McpConfig } from '../src/config.js';
import type { ToolDeps } from '../src/server.js';
import { connectClient } from './helpers/connect.js';
import { createFakeFetch, jsonResponse, type RouteTable } from './helpers/fake-fetch.js';
import {
  REPO_ID,
  PR_ID,
  AGENT_ID,
  RUN_ID,
  repoFixture,
  prFixture,
  agentFixture,
  runFixture,
  activeRunFixture,
  reviewFixture,
  blastFixture,
} from './helpers/fixtures.js';

function makeDeps(routes: RouteTable): {
  deps: ToolDeps;
  calls: ReturnType<typeof createFakeFetch>['calls'];
  callCount: ReturnType<typeof createFakeFetch>['callCount'];
} {
  const { fetchImpl, calls, callCount } = createFakeFetch(routes);
  const api = new DevDigestApi({ baseUrl: 'http://localhost:3001', timeoutMs: 1000, fetchImpl });
  const resolver = new Resolver(api);
  const runs = new RunRegistry();
  const config: McpConfig = {
    apiBase: 'http://localhost:3001',
    runTimeoutMs: 40,
    pollIntervalMs: 10,
    httpTimeoutMs: 1000,
  };
  return { deps: { api, resolver, runs, config }, calls, callCount };
}

// test-only: the parsed tool JSON output is asserted on ad hoc per test, not
// worth a full view type here.
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type ParsedView = any;

async function call(
  client: Client,
  name: string,
  args: Record<string, unknown> = {},
): Promise<{ isError: boolean; view: ParsedView | undefined; text: string }> {
  const result = await client.callTool({ name, arguments: args });
  const block = Array.isArray(result.content) ? result.content[0] : undefined;
  const text =
    block && typeof block === 'object' && 'text' in block ? (block as { text: string }).text : '';
  const isError = result.isError === true;
  return {
    isError,
    // Error results are `Error: <message>` plain text, not JSON — only
    // non-error results are the JSON views this helper parses for callers.
    view: !isError && text ? (JSON.parse(text) as ParsedView) : undefined,
    text,
  };
}

describe('list_agents', () => {
  it('returns the configured agents', async () => {
    const { deps } = makeDeps({
      'GET /agents': () => jsonResponse([agentFixture()]),
    });
    const client = await connectClient(deps);

    const { isError, view } = await call(client, 'list_agents');
    expect(isError).toBe(false);
    expect(view.agents).toHaveLength(1);
    expect(view.agents[0].name).toBe('Security Reviewer');
  });
});

describe('run_agent_on_pr', () => {
  it('starts a run and returns the done review result', async () => {
    const { deps, callCount } = makeDeps({
      'GET /repos': () => jsonResponse([repoFixture()]),
      'GET /repos/:id/pulls': () => jsonResponse([prFixture()]),
      'GET /agents': () => jsonResponse([agentFixture()]),
      'GET /pulls/:id/runs/active': () => jsonResponse([]),
      'POST /pulls/:id/review': () =>
        jsonResponse({
          pr_id: PR_ID,
          runs: [{ run_id: RUN_ID, agent_id: AGENT_ID, agent_name: 'Security Reviewer' }],
          reviews: [],
        }),
      'GET /pulls/:id/runs': () => jsonResponse([runFixture()]),
      'GET /pulls/:id/reviews': () => jsonResponse([reviewFixture()]),
    });
    const client = await connectClient(deps);

    const { isError, view } = await call(client, 'run_agent_on_pr', {
      repo: 'acme/payments-api',
      pr: 482,
      agent: 'security',
    });

    expect(isError).toBe(false);
    expect(view.status).toBe('done');
    expect(view.verdict).toBe('request_changes');
    expect(view.run_id).toBe(RUN_ID);
    expect(callCount(`POST /pulls/${PR_ID}/review`)).toBe(1);
  });

  it('attaches to an already-running run for the same agent instead of starting a new one', async () => {
    const { deps, callCount } = makeDeps({
      'GET /repos': () => jsonResponse([repoFixture()]),
      'GET /repos/:id/pulls': () => jsonResponse([prFixture()]),
      'GET /agents': () => jsonResponse([agentFixture()]),
      'GET /pulls/:id/runs/active': () => jsonResponse([activeRunFixture()]),
      'POST /pulls/:id/review': () => {
        throw new Error('must not start a second run while one is active');
      },
      'GET /pulls/:id/runs': () => jsonResponse([runFixture()]),
      'GET /pulls/:id/reviews': () => jsonResponse([reviewFixture()]),
    });
    const client = await connectClient(deps);

    const { isError, view } = await call(client, 'run_agent_on_pr', {
      repo: 'acme/payments-api',
      pr: 482,
      agent: 'security',
    });

    expect(isError).toBe(false);
    expect(view.attached).toBe(true);
    expect(callCount(`POST /pulls/${PR_ID}/review`)).toBe(0);
  });

  it('returns a running status + run_id on timeout, then get_findings(run_id) resolves it once done', async () => {
    let polls = 0;
    const { deps } = makeDeps({
      'GET /repos': () => jsonResponse([repoFixture()]),
      'GET /repos/:id/pulls': () => jsonResponse([prFixture()]),
      'GET /agents': () => jsonResponse([agentFixture()]),
      'GET /pulls/:id/runs/active': () => jsonResponse([]),
      'POST /pulls/:id/review': () =>
        jsonResponse({
          pr_id: PR_ID,
          runs: [{ run_id: RUN_ID, agent_id: AGENT_ID, agent_name: 'Security Reviewer' }],
          reviews: [],
        }),
      'GET /pulls/:id/runs': () => {
        polls += 1;
        // First poll(s): still running (until timeout kicks in); afterwards done.
        return jsonResponse([runFixture({ status: polls <= 20 ? 'running' : 'done' })]);
      },
      'GET /pulls/:id/reviews': () => jsonResponse([reviewFixture()]),
    });
    const client = await connectClient(deps);

    const timeoutResult = await call(client, 'run_agent_on_pr', {
      repo: 'acme/payments-api',
      pr: 482,
      agent: 'security',
    });
    expect(timeoutResult.isError).toBe(false);
    expect(timeoutResult.view.status).toBe('running');
    expect(timeoutResult.view.run_id).toBe(RUN_ID);

    // Now a fresh call resolves via the same RunRegistry entry from the call above.
    polls = 21;
    const followUp = await call(client, 'get_findings', { run_id: RUN_ID });
    expect(followUp.isError).toBe(false);
    expect(followUp.view.status).toBe('done');
  });

  it('surfaces run_failed with a provider hint when the error mentions an API key', async () => {
    const { deps } = makeDeps({
      'GET /repos': () => jsonResponse([repoFixture()]),
      'GET /repos/:id/pulls': () => jsonResponse([prFixture()]),
      'GET /agents': () => jsonResponse([agentFixture()]),
      'GET /pulls/:id/runs/active': () => jsonResponse([]),
      'POST /pulls/:id/review': () =>
        jsonResponse({
          pr_id: PR_ID,
          runs: [{ run_id: RUN_ID, agent_id: AGENT_ID, agent_name: 'Security Reviewer' }],
          reviews: [],
        }),
      'GET /pulls/:id/runs': () =>
        jsonResponse([
          runFixture({ status: 'failed', error: 'Invalid API key (401) for provider openrouter' }),
        ]),
    });
    const client = await connectClient(deps);

    const { isError, view, text } = await call(client, 'run_agent_on_pr', {
      repo: 'acme/payments-api',
      pr: 482,
      agent: 'security',
    });
    expect(isError).toBe(true);
    expect(view).toBeUndefined();
    expect(text).toContain('failed');
    expect(text).toContain('Check the openrouter API key');
  });

  it('rejects an unknown agent with agent_not_found', async () => {
    const { deps } = makeDeps({
      'GET /repos': () => jsonResponse([repoFixture()]),
      'GET /repos/:id/pulls': () => jsonResponse([prFixture()]),
      'GET /agents': () => jsonResponse([agentFixture()]),
    });
    const client = await connectClient(deps);

    const { isError, text } = await call(client, 'run_agent_on_pr', {
      repo: 'acme/payments-api',
      pr: 482,
      agent: 'nonexistent',
    });
    expect(isError).toBe(true);
    expect(text).toContain('Agent');
    expect(text).toContain('not found');
  });

  it('rejects an unknown repo with repo_not_found', async () => {
    const { deps } = makeDeps({
      'GET /repos': () => jsonResponse([repoFixture()]),
    });
    const client = await connectClient(deps);

    const { isError, text } = await call(client, 'run_agent_on_pr', {
      repo: 'acme/unknown',
      pr: 482,
      agent: 'security',
    });
    expect(isError).toBe(true);
    expect(text).toContain('not added in DevDigest');
  });

  it('rejects an un-imported PR with pr_not_imported', async () => {
    const { deps } = makeDeps({
      'GET /repos': () => jsonResponse([repoFixture()]),
      'GET /repos/:id/pulls': () => jsonResponse([]),
    });
    const client = await connectClient(deps);

    const { isError, text } = await call(client, 'run_agent_on_pr', {
      repo: 'acme/payments-api',
      pr: 999,
      agent: 'security',
    });
    expect(isError).toBe(true);
    expect(text).toContain('not found in DevDigest');
  });

  it('reports api_unreachable pointing at ./scripts/dev.sh when the API cannot be reached', async () => {
    const { deps } = makeDeps({
      'GET /repos': () => {
        throw new Error('connect ECONNREFUSED');
      },
    });
    const client = await connectClient(deps);

    const { isError, text } = await call(client, 'run_agent_on_pr', {
      repo: 'acme/payments-api',
      pr: 482,
      agent: 'security',
    });
    expect(isError).toBe(true);
    expect(text).toContain('./scripts/dev.sh');
  });
});

describe('get_findings', () => {
  it('resolves the latest done run by repo+pr+agent', async () => {
    const { deps } = makeDeps({
      'GET /repos': () => jsonResponse([repoFixture()]),
      'GET /repos/:id/pulls': () => jsonResponse([prFixture()]),
      'GET /agents': () => jsonResponse([agentFixture()]),
      'GET /pulls/:id/runs': () => jsonResponse([runFixture()]),
      'GET /pulls/:id/reviews': () => jsonResponse([reviewFixture()]),
    });
    const client = await connectClient(deps);

    const { isError, view } = await call(client, 'get_findings', {
      repo: 'acme/payments-api',
      pr: 482,
      agent: 'security',
    });
    expect(isError).toBe(false);
    expect(view.status).toBe('done');
    expect(view.findings.length).toBeGreaterThan(0);
  });

  it('returns run_unknown for a run_id this session never started, with no repo/pr fallback', async () => {
    const { deps } = makeDeps({});
    const client = await connectClient(deps);

    const { isError, text } = await call(client, 'get_findings', {
      run_id: '99999999-9999-4999-8999-999999999999',
    });
    expect(isError).toBe(true);
    expect(text).toContain('not known to this MCP session');
  });

  const OTHER_AGENT_ID = '77777777-7777-4777-8777-777777777777';
  const OTHER_RUN_ID = '88888888-8888-4888-8888-888888888888';

  it('aggregates every agent\'s latest review for repo+pr with no agent given', async () => {
    const { deps } = makeDeps({
      'GET /repos': () => jsonResponse([repoFixture()]),
      'GET /repos/:id/pulls': () => jsonResponse([prFixture()]),
      'GET /pulls/:id/runs': () =>
        jsonResponse([
          runFixture(),
          runFixture({
            run_id: OTHER_RUN_ID,
            agent_id: OTHER_AGENT_ID,
            agent_name: 'Style Reviewer',
            status: 'running',
          }),
        ]),
      'GET /pulls/:id/reviews': () => jsonResponse([reviewFixture()]),
    });
    const client = await connectClient(deps);

    const { isError, view } = await call(client, 'get_findings', {
      repo: 'acme/payments-api',
      pr: 482,
    });
    expect(isError).toBe(false);
    expect(view.reviews).toHaveLength(1);
    expect(view.reviews[0].agent).toBe('Security Reviewer');
    expect(view.agents_reviewed).toBe(1);
    expect(view.total_findings).toBe(view.reviews[0].total);
    expect(view.running).toEqual([
      { agent: 'Style Reviewer', run_id: OTHER_RUN_ID, elapsed_s: expect.any(Number) },
    ]);
    expect(view.note).toContain('1 agent(s) still running');
  });

  it('returns no_completed_review when no agent has any run or review for the PR', async () => {
    const { deps } = makeDeps({
      'GET /repos': () => jsonResponse([repoFixture()]),
      'GET /repos/:id/pulls': () => jsonResponse([prFixture()]),
      'GET /pulls/:id/runs': () => jsonResponse([]),
      'GET /pulls/:id/reviews': () => jsonResponse([]),
    });
    const client = await connectClient(deps);

    const { isError, text } = await call(client, 'get_findings', {
      repo: 'acme/payments-api',
      pr: 482,
    });
    expect(isError).toBe(true);
    expect(text).toContain('No completed review for acme/payments-api PR #482');
  });
});

describe('get_conventions', () => {
  it('returns accepted candidates by default', async () => {
    const scan: ConventionScan = {
      id: 'scan-1',
      repo_id: REPO_ID,
      status: 'done',
      sha: 'abc123',
      provider: 'openrouter',
      model: 'deepseek/deepseek-v4-flash',
      candidates_proposed: 2,
      candidates_verified: 1,
      degraded: false,
      degraded_reason: null,
      created_at: '2026-09-20T00:00:00.000Z',
    };
    const candidate: ConventionCandidate = {
      id: 'cand-1',
      repo_id: REPO_ID,
      scan_id: 'scan-1',
      category: 'naming',
      rule: 'Use kebab-case for module folders',
      evidence_path: 'src/a.ts',
      evidence_line: 10,
      evidence_snippet: '',
      evidence_sha: null,
      evidence_url: null,
      evidences: [],
      confidence: 0.9,
      status: 'accepted',
      edited: false,
      created_at: '2026-09-20T00:00:00.000Z',
    };
    const { deps } = makeDeps({
      'GET /repos': () => jsonResponse([repoFixture()]),
      'GET /repos/:id/conventions': () => jsonResponse({ scan, candidates: [candidate] }),
    });
    const client = await connectClient(deps);

    const { isError, view } = await call(client, 'get_conventions', { repo: 'acme/payments-api' });
    expect(isError).toBe(false);
    expect(view.conventions).toHaveLength(1);
    expect(view.counts.accepted).toBe(1);
  });

  it('reports "no scan yet" when the repo has never been extracted', async () => {
    const { deps } = makeDeps({
      'GET /repos': () => jsonResponse([repoFixture()]),
      'GET /repos/:id/conventions': () => jsonResponse({ scan: null, candidates: [] }),
    });
    const client = await connectClient(deps);

    const { isError, view } = await call(client, 'get_conventions', { repo: 'acme/payments-api' });
    expect(isError).toBe(false);
    expect(view.scan).toBeNull();
    expect(view.note).toContain('No conventions extracted yet');
  });
});

describe('get_blast_radius', () => {
  it('returns counts and caller locations for a resolved PR', async () => {
    const { deps } = makeDeps({
      'GET /repos': () => jsonResponse([repoFixture()]),
      'GET /repos/:id/pulls': () => jsonResponse([prFixture()]),
      'GET /pulls/:id/blast': () => jsonResponse(blastFixture()),
    });
    const client = await connectClient(deps);

    const { isError, view } = await call(client, 'get_blast_radius', {
      repo: 'acme/payments-api',
      pr: 482,
    });
    expect(isError).toBe(false);
    expect(view.counts).toEqual({ symbols: 1, callers: 1, endpoints: 1, crons: 0 });
    expect(view.downstream[0].callers[0].location).toBe('src/routes/public.ts:23');
  });

  it('is never isError when the index is degraded, and says so in the note', async () => {
    const { deps } = makeDeps({
      'GET /repos': () => jsonResponse([repoFixture()]),
      'GET /repos/:id/pulls': () => jsonResponse([prFixture()]),
      'GET /pulls/:id/blast': () =>
        jsonResponse(blastFixture({ degraded: true, reason: 'index_partial' })),
    });
    const client = await connectClient(deps);

    const { isError, view } = await call(client, 'get_blast_radius', {
      repo: 'acme/payments-api',
      pr: 482,
    });
    expect(isError).toBe(false);
    expect(view.note).toMatch(/^Repo index degraded/);
  });

  it('rejects an unknown repo with repo_not_found', async () => {
    const { deps } = makeDeps({
      'GET /repos': () => jsonResponse([repoFixture()]),
    });
    const client = await connectClient(deps);

    const { isError, text } = await call(client, 'get_blast_radius', {
      repo: 'acme/unknown',
      pr: 482,
    });
    expect(isError).toBe(true);
    expect(text).toContain('not added in DevDigest');
  });
});
