import type { SmartDiffRole } from '@devdigest/shared';

/**
 * L03 — Smart Diff constants. Pure literals only (arrays / regexes), no
 * imports beyond the `SmartDiffRole` type — required by
 * `.dependency-cruiser.cjs`'s `helpers-and-constants-are-pure` rule
 * (`server/specs/L03-smart-diff.api.md`).
 *
 * The classifier rule constants moved to
 * `modules/_shared/smart-diff-classifier.ts` (shared with `brief/`).
 */

/** Fixed group order every `/pulls/:id/smart-diff` response emits. */
export const ROLE_ORDER: readonly SmartDiffRole[] = [
  'core',
  'tests',
  'wiring',
  'docs',
  'boilerplate',
] as const;
