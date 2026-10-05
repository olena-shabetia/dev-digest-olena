/** L05c — PR Brief literals and budgets. No logic here. */

export const BRIEF_SCHEMA_NAME = 'pr_brief';
export const BRIEF_MAX_RETRIES = 2;
export const BRIEF_MAX_TOKENS = 3000;
/** Per-attempt LLM timeout; three schema attempts fit inside Node's default requestTimeout. */
export const BRIEF_LLM_TIMEOUT_MS = 45_000;

// ---- Facts budget (SPEC-09 S-8) ----
export const BRIEF_FACTS_MAX_CHARS = 24_000;
export const BRIEF_TITLE_MAX = 300;
export const BRIEF_DESCRIPTION_MAX = 4_000;
export const BRIEF_INTENT_LIST_MAX = 10;
export const BRIEF_INTENT_ITEM_MAX = 200;
export const BRIEF_BLAST_SUMMARY_MAX = 600;
export const BRIEF_BLAST_SYMBOLS_MAX = 15;
export const BRIEF_BLAST_CALLER_FILES_MAX = 20;
export const BRIEF_FILES_MAX = 60;
export const BRIEF_HUNKS_PER_FILE_MAX = 3;
export const BRIEF_FINDINGS_MAX = 20;
export const BRIEF_SPEC_DOC_MAX = 4_000;

// ---- Output caps applied by groundBrief ----
export const BRIEF_RISKS_MAX = 6;
export const BRIEF_FOCUS_MAX = 6;
export const BRIEF_STRING_MAX = 600;
export const BRIEF_TITLE_STRING_MAX = 120;
export const BRIEF_REASON_MAX = 240;

export const BRIEF_RISK_KINDS = [
  'security',
  'dependency',
  'performance',
  'data',
  'api_contract',
  'concurrency',
  'testing',
  'other',
] as const;

/** Order in which components are dropped when facts exceed BRIEF_FACTS_MAX_CHARS. */
export const BRIEF_DROP_ORDER = ['specs', 'hunks', 'findings', 'callers', 'files'] as const;

export const BRIEF_RATE_LIMIT = { max: 10, timeWindow: '1 minute' } as const;
