import type { SmartDiffFile, SmartDiffRole } from '@devdigest/shared';
import {
  BOILERPLATE_BASENAMES,
  BOILERPLATE_HAY_SUBSTRINGS,
  BOILERPLATE_HAY_SUFFIXES,
  DOCS_BASENAME_PREFIXES,
  DOCS_HAY_SUBSTRINGS,
  DOCS_HAY_SUFFIXES,
  TEST_FILE_RE,
  TEST_HAY_PREFIXES,
  TEST_HAY_SUBSTRINGS,
  TEST_HAY_SUFFIXES,
  WIRING_BASENAMES,
  WIRING_BASENAME_PREFIXES,
  WIRING_BASENAME_RE,
  WIRING_DOCKER_COMPOSE_RE,
  WIRING_HAY_PREFIXES,
  WIRING_HAY_SUBSTRINGS,
} from './constants.js';

/**
 * L03 — Smart Diff path classifier. Pure, synchronous, no I/O (no Fastify,
 * no `Container`) — importable standalone, exactly as
 * `plans/L03-smart-diff.md` §3 / this module's spec freezes it.
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

/**
 * Maps a `pr_files` row + its (already deduped/sorted) finding start-lines to
 * the `SmartDiffFile` DTO. `pseudocode_summary` is written explicitly as
 * `null` — never omitted (server/INSIGHTS.md 2026-09-21: an undeclared key
 * silently vanishes under `safeParse`-before-`stringify`, but this field's
 * contract is meant to also hold a later lesson's real value).
 */
export function toSmartDiffFile(
  file: { path: string; additions: number; deletions: number },
  findingLines: number[],
): SmartDiffFile {
  return {
    path: file.path,
    pseudocode_summary: null,
    additions: file.additions,
    deletions: file.deletions,
    finding_lines: findingLines,
  };
}
