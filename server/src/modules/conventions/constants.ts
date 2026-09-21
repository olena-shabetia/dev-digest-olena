/** Constants for the conventions module (HW2 — Conventions Extractor). */

/** Job kind registered on JobRunner for the extraction job handler. */
export const CONVENTIONS_EXTRACT_JOB_KIND = 'conventions-extract';

/** Deterministic code-file sample size handed to the extraction LLM call. */
export const SAMPLE_FILE_COUNT = 12;

/** At most this many of the 12 code samples may come from one top-level
 *  directory — keeps one hot module from monopolising the sample. */
export const MAX_FILES_PER_TOP_LEVEL_DIR = 2;

/** Over-fetch multiplier applied before diversifying/truncating the ranked
 *  file-path pool to `SAMPLE_FILE_COUNT`. */
export const SAMPLE_POOL_MULTIPLIER = 6;

/** Config files read straight from the clone (no LLM, no ranking needed).
 *  Listed as literal candidate filenames (checked at the clone root) rather
 *  than globs — much simpler than resolving glob patterns against a clone. */
export const CONFIG_FILE_CANDIDATES = [
  'eslint.config.js',
  'eslint.config.mjs',
  'eslint.config.cjs',
  'eslint.config.ts',
  '.eslintrc',
  '.eslintrc.json',
  '.eslintrc.js',
  '.eslintrc.cjs',
  '.eslintrc.yml',
  '.eslintrc.yaml',
  'tsconfig.json',
  '.prettierrc',
  '.prettierrc.json',
  '.prettierrc.js',
  '.prettierrc.cjs',
  '.prettierrc.yaml',
  '.prettierrc.yml',
  'prettier.config.js',
  'prettier.config.cjs',
  'prettier.config.mjs',
  'package.json',
] as const;

/** Every sampled file (config or code) is clamped to this many lines before
 *  being 1-based-line-numbered and handed to the model — bounds both the
 *  prompt size and what a cited `evidence.line` can possibly mean. */
export const MAX_FILE_LINES = 400;

/** Cap on distinct (deduped) candidates persisted per scan. */
export const MAX_CANDIDATES = 25;

/** Cap on verified occurrences kept per deduped candidate. */
export const MAX_EVIDENCES_PER_CANDIDATE = 5;

/** Name of the generated skill built from accepted candidates. */
export const CONVENTION_SKILL_NAME = 'repo-conventions';

/** Extraction LLM default (decision: OpenRouter cheap model, overridable via
 *  Settings → Feature Models). Deliberately NOT `FEATURE_MODELS`' registry
 *  default (`openai`/`gpt-5.4`) — this is the "no override yet" fallback the
 *  extractor itself falls back to when
 *  `repository.ts#getConventionsModelOverride` returns `undefined`, so a
 *  workspace's explicit choice always wins but an unset workspace still gets
 *  a cheap model, not a flagship one. */
export const DEFAULT_CONVENTIONS_MODEL = {
  provider: 'openrouter' as const,
  model: 'deepseek/deepseek-v4-flash',
};

/** Structured-output schema name passed to `completeStructured`. */
export const EXTRACTION_SCHEMA_NAME = 'ConventionExtraction';
