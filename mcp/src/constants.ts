/**
 * Shared literals for response shaping. Owned by WU-5 — every other unit only
 * imports from here (see plan §4 serialization ledger).
 */

export const DEFAULT_FINDINGS_LIMIT = 10;
export const MAX_FINDINGS_LIMIT = 50;
export const DEFAULT_CONVENTIONS_LIMIT = 20;
export const MAX_CONVENTIONS_LIMIT = 50;

/** L04 — `get_blast_radius` shaping caps (plan §3 MCP surface). */
export const MAX_BLAST_SYMBOLS = 10;
export const MAX_BLAST_CALLERS_PER_SYMBOL = 10;
export const MAX_BLAST_FACTS = 20;

/** Max characters kept for each PR-/repo-derived text field (untrusted input). */
export const TEXT_CAPS = {
  title: 120,
  why: 160,
  summary: 300,
  rule: 200,
  agentDescription: 100,
  symbol: 120,
  path: 200,
  fact: 120,
} as const;

/** `tools/list` character budget and per-tool description cap (plan §2 D11). */
export const TOOLS_LIST_CHAR_BUDGET = 6000;
export const TOOL_DESCRIPTION_MAX_CHARS = 450;
