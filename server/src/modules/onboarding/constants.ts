/** Constants for the onboarding module (L05b — Onboarding Tour). Literals only. */

/** Job kind registered on JobRunner for the tour generation handler. */
export const ONBOARDING_GENERATE_JOB_KIND = 'onboarding-generate';

/** Name handed to `completeStructured` for the annotation-only output. */
export const ONBOARDING_SCHEMA_NAME = 'onboarding_tour_annotations';

/** System prompt template file under `src/prompts/`. */
export const ONBOARDING_PROMPT_TEMPLATE = 'onboarding.system.md';

/** No workspace language setting exists yet (R-6). */
export const ONBOARDING_LANGUAGE = 'English';

// ---- Deterministic fact bounds ---------------------------------------------
export const MAX_STRUCTURE_DIRS = 30;
export const MAX_MANIFESTS = 10;
export const MAX_DEPS_PER_MANIFEST = 40;
export const MAX_SCRIPTS_PER_MANIFEST = 20;
/** Mirrors repo-intel's `MAX_FILE_SIZE` (repo-intel/constants.ts:43) — never imported. */
export const MAX_MANIFEST_BYTES = 400 * 1024;
/** Mirrors repo-intel's `HOTNESS_WINDOW_DAYS` (repo-intel/constants.ts:50) — never imported. */
export const HOTNESS_WINDOW_DAYS = 180;
export const HOTNESS_MAX_COMMITS = 500;
export const READING_POOL_SIZE = 100;
export const MAX_READING_PATH = 8;
export const MAX_CRITICAL_PATHS = 6;
export const MIN_CRITICAL_CHAINS = 3;
export const MAX_RUN_COMMANDS = 6;

// ---- LLM payload bounds ----------------------------------------------------
export const MAX_ENDPOINTS = 40;
export const MAX_README_CHARS = 4000;
export const MAX_FACTS_CHARS = 24_000;
export const MAX_OUTPUT_TOKENS = 4000;
export const LLM_ATTEMPT_TIMEOUT_MS = 30_000;
export const LLM_MAX_RETRIES = 2;
/** Overall deadline for the LLM step (D-9) — keeps the handler under JobRunner's 120 s. */
export const ONBOARDING_LLM_DEADLINE_MS = 85_000;
export const HISTORY_TIMEOUT_MS = 10_000;
/** A queued/running job older than this is treated as dead (D-10). */
export const INFLIGHT_STALE_MS = 360_000;

// ---- LLM output bounds -----------------------------------------------------
export const MAX_COMMENT_CHARS = 120;
export const MAX_FIRST_TASKS = 5;
export const MAX_DIAGRAM_CHARS = 4000;

// ---- Safety patterns (AC-48) -----------------------------------------------
export const SCRIPT_NAME_RE = /^[A-Za-z0-9:_.-]+$/;
export const SAFE_DIR_RE = /^[A-Za-z0-9@._-]+$/;

// ---- Ordered lookups -------------------------------------------------------
export const RUN_SCRIPT_PREFERENCE = ['dev', 'start', 'serve'] as const;
export const FACT_DROP_ORDER = ['readme', 'endpoints', 'repo_map', 'dependencies'] as const;
export const README_CANDIDATES = ['README.md', 'readme.md'] as const;
export const LOCKFILES = [
  ['pnpm-lock.yaml', 'pnpm'],
  ['yarn.lock', 'yarn'],
  ['package-lock.json', 'npm'],
] as const;
export const COMPOSE_FILES = ['docker-compose.yml', 'compose.yaml'] as const;
