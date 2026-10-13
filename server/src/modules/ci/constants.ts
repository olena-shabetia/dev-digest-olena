/**
 * L07 — Export to CI literals. Constants only: no logic, no imports.
 * Frozen by plans/L07-export-to-ci.md §3.
 */
export const CI_BRANCH = 'devdigest/ci';
export const CI_PR_TITLE = 'Add DevDigest CI review';
export const CI_WORKFLOW_FILE = 'devdigest-review.yml';
export const CI_WORKFLOW_PATH = '.github/workflows/devdigest-review.yml';
export const CI_RUNNER_PATH = '.devdigest/runner/index.js';
export const CI_MEMORY_PATH = '.devdigest/memory.jsonl';
export const CI_ARTIFACT_NAME = 'devdigest-result';
export const CI_ARTIFACT_FILE = 'devdigest-result.json';
export const CI_MANIFEST_SCHEMA_VERSION = 1;
export const CHECKOUT_SHA = '11bd71901bbe5b1630ceea73d27597364c9af683'; // actions/checkout v4.2.2 (verified 2026-10-12)
export const UPLOAD_ARTIFACT_SHA = 'ea165f8d65b6e75b540449e92b4886f43607fa02'; // actions/upload-artifact v4.6.2 (verified 2026-10-12)
export const ALLOWED_PERMISSIONS = { contents: 'read', 'pull-requests': 'write' } as const;
export const FORBIDDEN_TRIGGERS = ['pull_request_target', 'workflow_run'] as const;
export const INGEST_MAX_RUNS_PER_REPO = 50;
export const CI_RUNS_LIST_LIMIT = 200;
export const ARTIFACT_MAX_BYTES = 256 * 1024;
export const SECRET_MIN_LENGTH = 8;
export const SECRET_KEYS = ['OPENROUTER_API_KEY', 'GITHUB_TOKEN'] as const;

/** Error code for the one-agent-per-repository conflict (409). */
export const CI_CONFLICT_CODE = 'ci_conflict';
