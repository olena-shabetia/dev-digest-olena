/** Constants for the DiffViewer. */

/** Files with this many or fewer changed lines start expanded. */
export const AUTO_EXPAND_MAX_LINES = 200;

/** Matches a unified-diff hunk header, e.g. `@@ -1,2 +1,3 @@`. */
export const HUNK_HEADER_RE = /@@ -(\d+)(?:,\d+)? \+(\d+)(?:,\d+)? @@/;

/**
 * Findings on the same file within this many lines of each other are
 * anchored together under one line instead of each rendering separately.
 * Independent review agents describing the same underlying defect routinely
 * pick slightly different `start_line`s within the same statement/block
 * (e.g. three agents each flagging one `RegExp` constructor call at lines
 * 77/78/79 of the same function) — a UI-only display fix, not a change to
 * how agents choose lines. Trade-off: two genuinely unrelated findings that
 * happen to land this close together will also cluster into one anchor.
 */
export const FINDING_CLUSTER_MAX_GAP = 2;
