/**
 * Pure workflow logic for Export to CI: render the generated GitHub Actions
 * workflow, apply the Configure-step choices to user-edited text, and validate
 * the result. No I/O. This is the security-critical piece reviewers read:
 * it is what keeps a generated workflow off `pull_request_target`/`workflow_run`
 * and inside `contents: read` + `pull-requests: write` (crit. 10).
 */
import { parse, parseDocument } from 'yaml';
import type { CiPostAs, CiTrigger } from '@devdigest/shared';
import {
  CHECKOUT_SHA,
  CI_JOB_TIMEOUT_MINUTES,
  CI_RUNNER_PATH,
  FORBIDDEN_TRIGGERS,
  UPLOAD_ARTIFACT_SHA,
} from './constants.js';

const TRIGGER_ORDER: readonly CiTrigger[] = ['opened', 'synchronize', 'reopened'];

/** Triggers in the canonical order opened, synchronize, reopened (deduped). */
export function orderTriggers(triggers: readonly CiTrigger[]): CiTrigger[] {
  return TRIGGER_ORDER.filter((t) => triggers.includes(t));
}

export function renderWorkflow(opts: { triggers: readonly CiTrigger[]; postAs: CiPostAs }): string {
  const types = orderTriggers(opts.triggers).join(', ');
  return `name: DevDigest Review
on:
  pull_request:
    types: [${types}]
permissions:
  contents: read
  pull-requests: write
jobs:
  review:
    if: github.event.pull_request.head.repo.full_name == github.repository
    runs-on: ubuntu-latest
    timeout-minutes: ${CI_JOB_TIMEOUT_MINUTES}
    steps:
      - uses: actions/checkout@${CHECKOUT_SHA} # v4.2.2
        with:
          ref: \${{ github.event.pull_request.base.sha }}
          persist-credentials: false
      - name: DevDigest review
        run: node ${CI_RUNNER_PATH}
        env:
          OPENROUTER_API_KEY: \${{ secrets.OPENROUTER_API_KEY }}
          GITHUB_TOKEN: \${{ secrets.GITHUB_TOKEN }}
          PR_NUMBER: \${{ github.event.pull_request.number }}
          DEVDIGEST_POST_AS: ${opts.postAs}
      - name: Upload result
        if: always()
        uses: actions/upload-artifact@${UPLOAD_ARTIFACT_SHA} # v4.6.2
        with:
          name: devdigest-result
          path: devdigest-result.json
          if-no-files-found: ignore
`;
}

function isRecord(v: unknown): v is Record<string, unknown> {
  return typeof v === 'object' && v !== null && !Array.isArray(v);
}

/**
 * Apply the Configure choices to the workflow text the user sees: set `on` to
 * `{ pull_request: { types } }` and set `DEVDIGEST_POST_AS` on the first step of
 * each job that runs the runner. Returns the input unchanged on a parse error
 * (validateWorkflow then reports it).
 */
export function applyConfigure(
  text: string,
  triggers: readonly CiTrigger[],
  postAs: CiPostAs,
): string {
  const doc = parseDocument(text);
  if (doc.errors.length > 0) return text;

  doc.setIn(['on'], { pull_request: { types: orderTriggers(triggers) } });

  const js: unknown = doc.toJS();
  const jobs = isRecord(js) && isRecord(js.jobs) ? js.jobs : {};
  for (const [jobName, job] of Object.entries(jobs)) {
    if (!isRecord(job) || !Array.isArray(job.steps)) continue;
    const idx = job.steps.findIndex(
      (s) => isRecord(s) && typeof s.run === 'string' && s.run.includes(CI_RUNNER_PATH),
    );
    if (idx >= 0) doc.setIn(['jobs', jobName, 'steps', idx, 'env', 'DEVDIGEST_POST_AS'], postAs);
  }
  return doc.toString();
}

const PERMISSION_LEVELS: Record<string, readonly string[]> = {
  contents: ['none', 'read'],
  'pull-requests': ['none', 'read', 'write'],
};

function permissionProblem(perms: unknown): string | null {
  if (typeof perms === 'string') return `Permission ${perms} is broader than allowed`;
  if (!isRecord(perms)) return null;
  for (const [key, level] of Object.entries(perms)) {
    const allowed = PERMISSION_LEVELS[key];
    if (!allowed || typeof level !== 'string' || !allowed.includes(level)) {
      return `Permission ${key}: ${String(level)} is broader than allowed`;
    }
  }
  return null;
}

/** A reason string when the workflow must be rejected, else null (crit. 10). */
export function validateWorkflow(text: string): string | null {
  const doc = parseDocument(text);
  if (doc.errors.length > 0) {
    return `Workflow is not valid YAML: ${doc.errors[0]!.message}`;
  }
  const root: unknown = parse(text);
  if (!isRecord(root)) return 'Workflow is not valid YAML: expected a mapping at the top level';

  const on = root.on;
  const names: string[] = [];
  if (typeof on === 'string') names.push(on);
  else if (Array.isArray(on)) names.push(...on.filter((x): x is string => typeof x === 'string'));
  else if (isRecord(on)) names.push(...Object.keys(on));
  const forbidden = names.find((n) => (FORBIDDEN_TRIGGERS as readonly string[]).includes(n));
  if (forbidden) return `Trigger ${forbidden} is not allowed`;

  if (!isRecord(root.permissions)) {
    return 'The workflow must declare permissions: contents: read, pull-requests: write';
  }
  const top = permissionProblem(root.permissions);
  if (top) return top;

  if (isRecord(root.jobs)) {
    for (const job of Object.values(root.jobs)) {
      if (!isRecord(job) || job.permissions === undefined) continue;
      const p = permissionProblem(job.permissions);
      if (p) return p;
    }
  }
  return null;
}
