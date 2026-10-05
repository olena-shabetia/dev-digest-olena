import type { SmartDiffFile } from '@devdigest/shared';

/**
 * L03 — Smart Diff helpers. The path classifier lives in
 * `modules/_shared/smart-diff-classifier.ts` so that `brief/` can share it
 * under `no-cross-module-imports`; it is re-exported here so `service.ts` and
 * `test/smart-diff-classify.test.ts` keep importing it from this file.
 */
export { classifyFile } from '../_shared/smart-diff-classifier.js';

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
