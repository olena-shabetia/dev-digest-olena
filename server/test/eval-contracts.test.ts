import { describe, expect, it } from 'vitest';
import {
  EvalCaseCreateRequest,
  EvalCaseDraftResponse,
  EvalCaseUpdateRequest,
  EvalDashboardIndex,
  EvalDraftRunRequest,
  EvalRunCompare,
  EvalSetRun,
} from '@devdigest/shared';

const UUID_A = '11111111-1111-4111-8111-111111111111';
const UUID_B = '22222222-2222-4222-8222-222222222222';

const expectation = {
  type: 'must_find' as const,
  file: 'src/a.ts',
  start_line: 1,
  end_line: 2,
  severity: 'WARNING',
  category: 'bug',
  title: 't',
};
const pr = { number: 1, title: 'pr', body: null, head_sha: 'abc' };
const detail = {
  id: 'c1',
  agent_id: 'a1',
  agent_name: 'Agent',
  source_finding_id: null,
  name: 'n',
  input_diff: 'd',
  pr,
  expectation,
  created_at: '2026-01-01T00:00:00.000Z',
  updated_at: '2026-01-01T00:00:00.000Z',
  last_result: null,
};
const summary = {
  id: 'r1',
  agent_id: 'a1',
  agent_name: 'Agent',
  status: 'completed' as const,
  error: null,
  agent_version: 1,
  version_label: 'v1',
  provider: 'openai',
  model: 'm',
  started_at: '2026-01-01T00:00:00.000Z',
  finished_at: null,
  cases_total: 1,
  cases_done: 1,
  cases_passed: null,
  cases_errored: null,
  recall: null,
  precision: null,
  citation_accuracy: null,
  duration_ms: null,
  cost_usd: null,
};
const run = {
  ...summary,
  strategy: 'single',
  system_prompt: 'p',
  skills: [],
  cases: [],
  results: [],
};

describe('eval contracts', () => {
  it('EvalCaseDraftResponse accepts both branches and rejects an unknown kind', () => {
    const draft = {
      finding_id: 'f',
      agent_id: 'a1',
      agent_name: 'Agent',
      name: 'n',
      input_diff: 'd',
      pr,
      expectation,
      needs_relocation: false,
    };
    expect(EvalCaseDraftResponse.safeParse({ kind: 'draft', draft }).success).toBe(true);
    expect(EvalCaseDraftResponse.safeParse({ kind: 'existing', case: detail }).success).toBe(true);
    expect(EvalCaseDraftResponse.safeParse({ kind: 'other' }).success).toBe(false);
  });

  it('EvalDraftRunRequest needs exactly one of finding_id / case_id', () => {
    const base = { input_diff: 'd', expectation: { file: 'f', start_line: 1, end_line: 1 } };
    expect(EvalDraftRunRequest.safeParse({ ...base, finding_id: UUID_A, case_id: UUID_B }).success).toBe(false);
    expect(EvalDraftRunRequest.safeParse(base).success).toBe(false);
    expect(EvalDraftRunRequest.safeParse({ ...base, finding_id: UUID_A }).success).toBe(true);
    expect(EvalDraftRunRequest.safeParse({ ...base, case_id: UUID_B }).success).toBe(true);
  });

  it('EvalSetRun allows all metrics null and rejects out-of-range metrics', () => {
    expect(EvalSetRun.safeParse(run).success).toBe(true);
    expect(EvalSetRun.safeParse({ ...run, recall: 1.5 }).success).toBe(false);
  });

  it('EvalRunCompare and EvalDashboardIndex parse', () => {
    const compare = {
      base: run,
      head: run,
      delta: { recall: null, precision: 0.1, citation_accuracy: null, cost_usd: null },
      prompt_changed: false,
      model_changed: false,
      skills_changed: false,
      cases_only_in_base: [],
      cases_only_in_head: [],
      cases_edited: [],
      comparable: true,
    };
    expect(EvalRunCompare.safeParse(compare).success).toBe(true);
    expect(EvalRunCompare.safeParse({ ...compare, comparable: 'yes' }).success).toBe(false);
    const dash = {
      agents: [
        {
          agent: { id: 'a1', name: 'A', provider: 'openai', model: 'm', version: 1 },
          cases_total: 1,
          latest_completed: summary,
        },
      ],
      recent_runs: [summary],
    };
    expect(EvalDashboardIndex.safeParse(dash).success).toBe(true);
    expect(EvalDashboardIndex.safeParse({ agents: [] }).success).toBe(false);
  });

  it('request shapes accept loose values (D-16)', () => {
    const loose = { file: '', start_line: 0, end_line: -1 };
    expect(EvalCaseCreateRequest.safeParse({ finding_id: UUID_A, name: '', input_diff: '', expectation: loose }).success).toBe(true);
    expect(EvalCaseUpdateRequest.safeParse({ name: '', input_diff: '', expectation: { ...loose, end_line: 1.5 } }).success).toBe(true);
    expect(EvalDraftRunRequest.safeParse({ finding_id: UUID_A, input_diff: '', expectation: loose }).success).toBe(true);
  });

  it('request shapes strip server-owned keys (D-17)', () => {
    const extra = { owner_id: 'x', pr, severity: 'CRITICAL', category: 'c', title: 't', type: 'must_find' };
    const exp = { file: 'f', start_line: 1, end_line: 1, ...extra };
    const create = EvalCaseCreateRequest.parse({ finding_id: UUID_A, name: 'n', input_diff: 'd', expectation: exp, ...extra });
    const update = EvalCaseUpdateRequest.parse({ name: 'n', input_diff: 'd', expectation: exp, ...extra });
    const draftRun = EvalDraftRunRequest.parse({ finding_id: UUID_A, input_diff: 'd', expectation: exp, ...extra });
    for (const parsed of [create, update, draftRun]) {
      expect(Object.keys(parsed)).not.toEqual(expect.arrayContaining(['owner_id']));
      for (const k of Object.keys(extra)) {
        expect(parsed).not.toHaveProperty(k);
        expect(parsed.expectation).not.toHaveProperty(k);
      }
    }
  });
});
