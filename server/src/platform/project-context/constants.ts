/**
 * L05 — project-context reader constants.
 *
 * These are a deliberate, standalone copy — NOT an import from
 * `src/modules/repo-intel/constants.ts`. `src/platform/**` must never depend
 * on `src/modules/**` (rule `platform-no-modules`), and the two sets of
 * excluded dirs are allowed to diverge over time (repo-intel indexes code,
 * this reads markdown docs).
 */

/** Post-cap length for one doc's content, in characters. */
export const PROJECT_CONTEXT_MAX_DOC_CHARS = 12_000;

/** Default discovery glob when `PROJECT_CONTEXT_GLOBS` is unset or empty. */
export const PROJECT_CONTEXT_DEFAULT_GLOB = '**/{specs,docs,insights}/**/*.md';

/** Directories discovery never descends into. */
export const PROJECT_CONTEXT_EXCLUDED_DIRS = [
  'node_modules',
  'dist',
  'build',
  'coverage',
  '.next',
  'out',
  'vendor',
  '.git',
] as const;

/** Files larger than this are stat-skipped during discovery (never read). */
export const PROJECT_CONTEXT_MAX_FILE_BYTES = 400 * 1024;

/** Discovery stops after finding this many docs. */
export const PROJECT_CONTEXT_MAX_DOCS = 1000;
