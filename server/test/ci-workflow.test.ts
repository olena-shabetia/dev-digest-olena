import { describe, it, expect } from 'vitest';
import { parse } from 'yaml';
import { renderWorkflow, validateWorkflow } from '../src/modules/ci/workflow.js';
import { CI_JOB_TIMEOUT_MINUTES } from '../src/modules/ci/constants.js';

describe('generated CI workflow', () => {
  const text = renderWorkflow({ triggers: ['opened', 'synchronize'], postAs: 'github_review' });
  const wf = parse(text) as { jobs: { review: Record<string, unknown> } };

  it('caps the review job well below GitHub\'s 360-minute default', () => {
    expect(wf.jobs.review['timeout-minutes']).toBe(CI_JOB_TIMEOUT_MINUTES);
    expect(CI_JOB_TIMEOUT_MINUTES).toBeLessThanOrEqual(15);
  });

  it('still passes its own validation', () => {
    expect(validateWorkflow(text)).toBeNull();
  });
});
