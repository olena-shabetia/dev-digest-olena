/* Constants for BlastRadiusCard — view toggle values, pill color tokens
   (not a severity map: endpoints/crons/changed-symbol each get one fixed
   token, see client/INSIGHTS.md 2026-09-18 "SEV_COLOR drift"), and the
   Graph view's layout geometry. */

export const BLAST_VIEWS = ["tree", "graph"] as const;
export type BlastView = (typeof BLAST_VIEWS)[number];

export const ENDPOINT_COLOR = { color: "var(--accent-text)", bg: "var(--accent-bg)" };
export const CRON_COLOR = { color: "var(--warn)", bg: "var(--warn-bg)" };
export const SYMBOL_COLOR = "var(--accent)";

// ---- Graph geometry (BlastGraph + layoutBlastGraph) ----
export const GRAPH_COLUMN_X = { symbol: 16, caller: 220, endpoint: 424 } as const;
export const GRAPH_NODE_HEIGHT = 28;
export const GRAPH_NODE_GAP = 10;
export const GRAPH_NODE_WIDTH = 180;
export const GRAPH_TOP_PADDING = 16;

export const MAX_GRAPH_SYMBOLS = 6;
export const MAX_GRAPH_CALLERS = 12;
export const MAX_GRAPH_ENDPOINTS = 8;
