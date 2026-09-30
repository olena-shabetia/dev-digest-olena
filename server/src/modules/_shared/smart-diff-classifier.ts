import type { SmartDiffRole } from '@devdigest/shared';

/**
 * L03 — Smart Diff path classifier, hosted in `_shared` so both `smart-diff/`
 * and `brief/` can use it without tripping `no-cross-module-imports`.
 * Pure, synchronous, no I/O (no Fastify, no `Container`).
 *
 * The 5-rule, first-match-wins classification algorithm and this exact
 * pattern set are frozen in `plans/L03-smart-diff.md` §3 / that module's
 * spec — do not add, remove, or reorder a rule without updating both.
 */

// ---- Rule 1: boilerplate ---------------------------------------------------
const BOILERPLATE_BASENAMES = new Set(['pnpm-lock.yaml', 'package-lock.json', 'yarn.lock']);
const BOILERPLATE_HAY_SUFFIXES = ['.lock', '.snap', '.min.js'];
const BOILERPLATE_HAY_SUBSTRINGS = ['/dist/', '/build/', '/snapshots/', '/__snapshots__/', '.generated.'];

// ---- Rule 2: tests ----------------------------------------------------------
const TEST_FILE_RE = /\.(it\.)?test\.tsx?$/;
const TEST_HAY_SUFFIXES = ['.spec.ts', '.spec.tsx'];
const TEST_HAY_SUBSTRINGS = ['/test/', '/tests/', '/__tests__/'];
const TEST_HAY_PREFIXES = ['/e2e/'];

// ---- Rule 3: wiring ----------------------------------------------------------
const WIRING_BASENAMES = new Set(['index.ts', 'index.js']);
const WIRING_HAY_SUBSTRINGS = ['.config.'];
const WIRING_BASENAME_RE = /^tsconfig.*\.json$/;
const WIRING_BASENAME_PREFIXES = ['.eslintrc', '.env'];
const WIRING_DOCKER_COMPOSE_RE = /^docker-compose.*\.ya?ml$/;
const WIRING_HAY_PREFIXES = ['/.github/', '/.claude/'];

// ---- Rule 4: docs -------------------------------------------------------------
const DOCS_HAY_SUFFIXES = ['.md'];
const DOCS_HAY_SUBSTRINGS = ['/docs/'];
const DOCS_BASENAME_PREFIXES = ['readme', 'changelog', 'license'];

/**
 * L03 — Smart Diff path classifier.
 *
 * Normalization is frozen: lowercase, leading-slash-prefixed "hay", and the
 * basename after the last slash. Matching is first-match-wins in rule order
 * 1 (boilerplate) → 2 (tests) → 3 (wiring) → 4 (docs) → 5 (core, the
 * catch-all). Do not reorder a rule to "fix" a table row — the table in
 * `server/test/smart-diff-classify.test.ts` is the contract.
 */
export function classifyFile(path: string): SmartDiffRole {
  const hay = ('/' + path).toLowerCase();
  const base = hay.slice(hay.lastIndexOf('/') + 1);

  // ---- 1. boilerplate ----
  if (
    hay.endsWith('.lock') ||
    BOILERPLATE_BASENAMES.has(base) ||
    BOILERPLATE_HAY_SUBSTRINGS.some((s) => hay.includes(s)) ||
    BOILERPLATE_HAY_SUFFIXES.some((s) => hay.endsWith(s))
  ) {
    return 'boilerplate';
  }

  // ---- 2. tests ----
  if (
    TEST_FILE_RE.test(hay) ||
    TEST_HAY_SUFFIXES.some((s) => hay.endsWith(s)) ||
    TEST_HAY_SUBSTRINGS.some((s) => hay.includes(s)) ||
    TEST_HAY_PREFIXES.some((p) => hay.startsWith(p))
  ) {
    return 'tests';
  }

  // ---- 3. wiring ----
  if (
    WIRING_BASENAMES.has(base) ||
    WIRING_HAY_SUBSTRINGS.some((s) => hay.includes(s)) ||
    WIRING_BASENAME_RE.test(base) ||
    WIRING_BASENAME_PREFIXES.some((p) => base.startsWith(p)) ||
    WIRING_DOCKER_COMPOSE_RE.test(base) ||
    WIRING_HAY_PREFIXES.some((p) => hay.startsWith(p))
  ) {
    return 'wiring';
  }

  // ---- 4. docs ----
  if (
    DOCS_HAY_SUFFIXES.some((s) => hay.endsWith(s)) ||
    DOCS_HAY_SUBSTRINGS.some((s) => hay.includes(s)) ||
    DOCS_BASENAME_PREFIXES.some((p) => base.startsWith(p))
  ) {
    return 'docs';
  }

  // ---- 5. core (catch-all) ----
  return 'core';
}
