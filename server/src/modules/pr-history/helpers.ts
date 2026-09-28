/**
 * P3 — pure helpers for "Prior PRs touching these files": overlap
 * computation and the plain-English `notes` string. No I/O, no model call —
 * mirrors `blast/helpers.ts`'s "server-computed, client only renders" rule.
 */

/** Files a candidate PR touched that the current PR also changed, in the
 *  current PR's own file order (stable, predictable display order). */
export function computeFilesOverlap(candidateFiles: string[], changedFiles: string[]): string[] {
  const candidateSet = new Set(candidateFiles);
  return changedFiles.filter((f) => candidateSet.has(f));
}

/** Plain-English note — no model call, same discipline as `buildBlastSummary`. */
export function buildHistoryNote(overlapCount: number, changedCount: number): string {
  return `${overlapCount} of ${changedCount} changed file(s) overlap`;
}
