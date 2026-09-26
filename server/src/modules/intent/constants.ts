/** Constants for the intent module (L03 — Intent Layer). */

/** Derivation LLM default (decision: OpenRouter cheap model, overridable via
 *  Settings → Feature Models). Deliberately NOT `FEATURE_MODELS`' registry
 *  default lookup — this is the "no override yet" fallback the service
 *  itself falls back to when `repository.ts#getIntentModelOverride` returns
 *  `undefined`, mirroring `conventions/constants.ts#DEFAULT_CONVENTIONS_MODEL`. */
export const DEFAULT_INTENT_MODEL = {
  provider: 'openrouter' as const,
  model: 'deepseek/deepseek-v4-flash',
};

/** Structured-output schema name passed to `completeStructured`. */
export const INTENT_SCHEMA_NAME = 'IntentExtraction';

/**
 * GitHub's documented closing keywords, source only (compiled into a RegExp
 * by `sources.ts`) — `resolveIntentIssues` requires one of these immediately
 * before a `#N` / `owner/repo#N` / issue-URL reference; a bare reference with
 * no keyword is recorded separately as a weaker, distinct source kind
 * (`issue_unkeyworded`).
 */
export const ISSUE_CLOSING_KEYWORD_SRC = '\\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)\\b[:\\s]*';

/** `owner/repo#N` (optional owner/repo) or a full GitHub issue URL — shared
 *  by both the keyworded and the bare-fallback matcher in `sources.ts`. */
export const ISSUE_REF_SRC =
  '(?:([\\w.-]+)/([\\w.-]+))?#(\\d+)|https?://github\\.com/([\\w.-]+)/([\\w.-]+)/issues/(\\d+)';

/** In-repo plan/spec paths a PR body may reference — matched literally
 *  (never a glob) against the clone, mirroring the plan's "in-repo clone
 *  paths only, no arbitrary external URL fetching" scope limit. */
export const SPEC_PLAN_PATH_SRC = '(?:^|[\\s(])((?:specs|plans)/[\\w./-]+\\.md)';

/** Per-source-kind character caps applied before a block is handed to the
 *  classifier — bounds prompt size; deliberately generous for the body/spec
 *  kinds (the richest signal) and tight for the mechanically-derived ones. */
export const MAX_SOURCE_CHARS = {
  title: 300,
  body: 4000,
  issue: 4000,
  spec: 4000,
  plan: 4000,
  files: 2000,
  hunks: 2000,
  commits: 1000,
} as const;

/** Cap on distinct hunk-header lines rendered into the `hunks` block, so a
 *  huge PR doesn't blow the source budget with headers alone. */
export const MAX_HUNK_HEADERS = 60;
