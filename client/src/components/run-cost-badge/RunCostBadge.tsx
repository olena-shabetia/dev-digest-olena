/* RunCostBadge — the dollar cost of one or more agent runs, in the two shapes
   used across the PR-review surfaces (see specs/L01-run-cost-badge.md):
     - `compact`  — just the dollar figure, e.g. "$0.014" (PR-list COST column)
     - `detailed` — tokens + cost, e.g. "9,119 tok · $0.0013" (run timeline row)
   Presentational only — no data fetching, no i18n strings of its own (callers
   pass an already-localized `tokensLabel` for the detailed variant). */
import type { CSSProperties } from "react";
import { formatCost } from "@/lib/format";

export function RunCostBadge({
  costUsd,
  tokensLabel,
  style,
}: {
  /** USD cost; null renders as "—" (unknown), never "$0.00". */
  costUsd: number | null | undefined;
  /** Pre-formatted, already-localized tokens fragment (e.g. "9,119 tok").
   *  Omit for the compact PR-list variant. */
  tokensLabel?: string;
  style?: CSSProperties;
}) {
  const cost = formatCost(costUsd);
  return (
    <span className="tnum" style={{ color: "var(--text-muted)", fontSize: 12, ...style }}>
      {tokensLabel ? `${tokensLabel} · ${cost}` : cost}
    </span>
  );
}
