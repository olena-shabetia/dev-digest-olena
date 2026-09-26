import type { SmartDiffRole } from '@devdigest/shared';

/**
 * L03 — Smart Diff classification constants. Pure literals only (arrays /
 * regexes), no imports beyond the `SmartDiffRole` type — required by
 * `.dependency-cruiser.cjs`'s `helpers-and-constants-are-pure` rule
 * (`server/specs/L03-smart-diff.api.md`).
 *
 * The 5-rule, first-match-wins classification algorithm and this exact
 * pattern set are frozen in `plans/L03-smart-diff.md` §3 / this module's
 * spec — do not add, remove, or reorder a rule without updating both.
 */

/** Fixed group order every `/pulls/:id/smart-diff` response emits. */
export const ROLE_ORDER: readonly SmartDiffRole[] = [
  'core',
  'tests',
  'wiring',
  'docs',
  'boilerplate',
] as const;

// ---- Rule 1: boilerplate ---------------------------------------------------
export const BOILERPLATE_BASENAMES = new Set(['pnpm-lock.yaml', 'package-lock.json', 'yarn.lock']);
export const BOILERPLATE_HAY_SUFFIXES = ['.lock', '.snap', '.min.js'];
export const BOILERPLATE_HAY_SUBSTRINGS = ['/dist/', '/build/', '/snapshots/', '/__snapshots__/', '.generated.'];

// ---- Rule 2: tests ----------------------------------------------------------
export const TEST_FILE_RE = /\.(it\.)?test\.tsx?$/;
export const TEST_HAY_SUFFIXES = ['.spec.ts', '.spec.tsx'];
export const TEST_HAY_SUBSTRINGS = ['/test/', '/tests/', '/__tests__/'];
export const TEST_HAY_PREFIXES = ['/e2e/'];

// ---- Rule 3: wiring ----------------------------------------------------------
export const WIRING_BASENAMES = new Set(['index.ts', 'index.js']);
export const WIRING_HAY_SUBSTRINGS = ['.config.'];
export const WIRING_BASENAME_RE = /^tsconfig.*\.json$/;
export const WIRING_BASENAME_PREFIXES = ['.eslintrc', '.env'];
export const WIRING_DOCKER_COMPOSE_RE = /^docker-compose.*\.ya?ml$/;
export const WIRING_HAY_PREFIXES = ['/.github/', '/.claude/'];

// ---- Rule 4: docs -------------------------------------------------------------
export const DOCS_HAY_SUFFIXES = ['.md'];
export const DOCS_HAY_SUBSTRINGS = ['/docs/'];
export const DOCS_BASENAME_PREFIXES = ['readme', 'changelog', 'license'];
