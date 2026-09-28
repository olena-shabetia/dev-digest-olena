// Shared test fixtures for mcp/test/**. Typed against the same
// @devdigest/shared contracts the client parses responses with, so a
// fixture that drifts from the real shape fails typecheck here rather than
// surfacing as a mysterious `unexpected_shape` in a later WU's tests.
import type {
  Repo,
  PrMeta,
  Agent,
  RunSummary,
  ReviewRecord,
  FindingRecord,
  ActiveRun,
  BlastRadiusResponse,
} from '@devdigest/shared';

export const REPO_ID = '11111111-1111-4111-8111-111111111111';
export const PR_ID = '22222222-2222-4222-8222-222222222222';
export const AGENT_ID = '33333333-3333-4333-8333-333333333333';
export const RUN_ID = '44444444-4444-4444-8444-444444444444';
export const REVIEW_ID = '55555555-5555-4555-8555-555555555555';
export const FINDING_ID = '66666666-6666-4666-8666-666666666666';

export function repoFixture(overrides: Partial<Repo> = {}): Repo {
  return {
    id: REPO_ID,
    workspace_id: 'ws-1',
    owner: 'acme',
    name: 'payments-api',
    full_name: 'acme/payments-api',
    default_branch: 'main',
    clone_path: null,
    last_polled_at: null,
    created_by: null,
    ...overrides,
  };
}

export function prFixture(overrides: Partial<PrMeta> = {}): PrMeta {
  return {
    id: PR_ID,
    number: 482,
    title: 'Add rate limiting',
    author: 'octocat',
    branch: 'feature/rate-limit',
    base: 'main',
    head_sha: 'abc123',
    additions: 40,
    deletions: 5,
    files_count: 3,
    status: 'open',
    opened_at: '2026-09-20T00:00:00.000Z',
    updated_at: '2026-09-20T00:00:00.000Z',
    score: null,
    cost_usd: null,
    findings: null,
    ...overrides,
  };
}

export function agentFixture(overrides: Partial<Agent> = {}): Agent {
  return {
    id: AGENT_ID,
    name: 'Security Reviewer',
    description: 'Reviews for security issues',
    provider: 'openrouter',
    model: 'deepseek/deepseek-v4-flash',
    system_prompt: 'You review PRs for security issues.',
    output_schema: null,
    enabled: true,
    version: 1,
    strategy: 'single-pass',
    ci_fail_on: 'critical',
    repo_intel: true,
    ...overrides,
  };
}

export function runFixture(overrides: Partial<RunSummary> = {}): RunSummary {
  return {
    run_id: RUN_ID,
    agent_id: AGENT_ID,
    agent_name: 'Security Reviewer',
    pr_number: 482,
    provider: 'openrouter',
    model: 'deepseek/deepseek-v4-flash',
    status: 'done',
    error: null,
    duration_ms: 5000,
    tokens_in: 1000,
    tokens_out: 200,
    cost_usd: 0.01,
    findings_count: 10,
    grounding: null,
    ran_at: '2026-09-20T00:05:00.000Z',
    score: 42,
    blockers: 1,
    ...overrides,
  };
}

export function activeRunFixture(overrides: Partial<ActiveRun> = {}): ActiveRun {
  return {
    run_id: RUN_ID,
    agent_id: AGENT_ID,
    agent_name: 'Security Reviewer',
    ran_at: '2026-09-20T00:05:00.000Z',
    ...overrides,
  };
}

export function findingFixture(overrides: Partial<FindingRecord> = {}): FindingRecord {
  return {
    id: FINDING_ID,
    severity: 'CRITICAL',
    category: 'security',
    title: 'Hardcoded secret',
    file: 'src/config.ts',
    start_line: 12,
    end_line: 14,
    rationale: 'The API key is committed to the repo.',
    suggestion: 'Move it to SecretsProvider.',
    confidence: 0.9,
    kind: 'finding',
    trifecta_components: null,
    review_id: REVIEW_ID,
    accepted_at: null,
    dismissed_at: null,
    ...overrides,
  };
}

export function blastFixture(overrides: Partial<BlastRadiusResponse> = {}): BlastRadiusResponse {
  return {
    changed_symbols: [{ name: 'rateLimit', file: 'src/limits.ts', kind: 'function' }],
    downstream: [
      {
        symbol: 'rateLimit',
        callers: [{ name: 'publicRouter', file: 'src/routes/public.ts', line: 23 }],
        endpoints_affected: ['GET /api/public/items'],
        crons_affected: [],
      },
    ],
    summary: '1 changed symbol(s), 1 caller(s), 1 endpoint(s), 0 cron job(s)',
    endpoints: ['GET /api/public/items'],
    crons: [],
    facts_by_file: { 'src/routes/public.ts': { endpoints: ['GET /api/public/items'], crons: [] } },
    stats: { symbols: 1, callers: 1, endpoints: 1, crons: 0 },
    degraded: false,
    reason: null,
    ...overrides,
  };
}

export function reviewFixture(overrides: Partial<ReviewRecord> = {}): ReviewRecord {
  return {
    id: REVIEW_ID,
    pr_id: PR_ID,
    agent_id: AGENT_ID,
    run_id: RUN_ID,
    agent_name: 'Security Reviewer',
    kind: 'review',
    verdict: 'request_changes',
    summary: 'Found a hardcoded secret.',
    score: 42,
    model: 'deepseek/deepseek-v4-flash',
    grounding: null,
    created_at: '2026-09-20T00:05:00.000Z',
    findings: [findingFixture()],
    ...overrides,
  };
}
