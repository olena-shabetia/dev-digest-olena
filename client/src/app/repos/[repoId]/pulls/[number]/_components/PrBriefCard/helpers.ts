import type { BriefDataGap, BriefMeta, ReviewRecord, Verdict } from "@devdigest/shared";
import { formatCost, formatTokenCount } from "@/lib/format";
import { LARGE_PR_GAPS, VISIBLE_GAPS } from "./constants";

export interface BannerData {
  verdict: Verdict;
  score: number | null;
  findingsCount: number;
  blockers: number;
}

/** Banner figures from the newest review (reviews come newest-first), or null
 *  when there is no review or it has no verdict. */
export function latestReviewBanner(reviews: ReviewRecord[] | undefined): BannerData | null {
  const latest = reviews?.[0];
  if (!latest || !latest.verdict) return null;
  return {
    verdict: latest.verdict,
    score: latest.score,
    findingsCount: latest.findings.length,
    blockers: latest.findings.filter((f) => f.severity === "CRITICAL" && !f.dismissed_at).length,
  };
}

/** "$0.014 · 8,200 → 1,300" — the price is omitted when cost is unknown. */
export function costLine(meta: Pick<BriefMeta, "cost_usd" | "tokens_in" | "tokens_out">): string {
  const tokens = `${formatTokenCount(meta.tokens_in)} → ${formatTokenCount(meta.tokens_out)}`;
  return meta.cost_usd == null ? tokens : `${formatCost(meta.cost_usd)} · ${tokens}`;
}

/** Gaps worth telling the reader about (intent / blast / specs). */
export function visibleGaps(gaps: BriefDataGap[]): BriefDataGap[] {
  return gaps.filter((g) => VISIBLE_GAPS.includes(g));
}

export function hasLargePrGap(gaps: BriefDataGap[]): boolean {
  return gaps.some((g) => LARGE_PR_GAPS.includes(g));
}
