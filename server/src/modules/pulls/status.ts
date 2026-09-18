import type { PrStatus, PrFindingsRollup } from '@devdigest/shared';

/**
 * PR-list rollup helpers (pure — no DB / `this`, so they unit-test cleanly).
 *
 * The Pull Requests list shows, per PR: the latest review's SCORE, a FINDINGS
 * severity breakdown, and a review STATUS. The DB `status` column holds
 * GitHub's merge state (open/merged/closed); the review status
 * (needs_review / reviewed / stale) is DERIVED here for OPEN PRs from the
 * commit a review last ran against (`lastReviewedSha`) vs the PR head, plus age.
 */

/** Open PRs whose current head was reviewed but untouched this long read "stale". */
export const STALE_DAYS = 7;

export interface SeverityCounts {
  critical: number;
  warning: number;
  suggestion: number;
}

/** Tally finding severities (CRITICAL / WARNING / SUGGESTION) for one review. */
export function rollupSeverities(rows: { severity: string }[]): SeverityCounts {
  const c: SeverityCounts = { critical: 0, warning: 0, suggestion: 0 };
  for (const r of rows) {
    if (r.severity === 'CRITICAL') c.critical += 1;
    else if (r.severity === 'WARNING') c.warning += 1;
    else if (r.severity === 'SUGGESTION') c.suggestion += 1;
  }
  return c;
}

/** How long a preview's plain-text description is allowed to be. */
export const PREVIEW_DESCRIPTION_MAX = 160;

/** Sort weight per severity for the preview ordering (lower = first). */
const SEVERITY_RANK: Record<string, number> = { CRITICAL: 0, WARNING: 1, SUGGESTION: 2 };

export interface FindingRollupRow {
  severity: string;
  category: string;
  title: string;
  file: string;
  startLine: number;
  endLine: number;
  confidence: number;
  rationale: string;
}

/** Collapse markdown-ish rationale into a single-line, truncated plain-text
 *  preview: strips code fences/backticks, collapses whitespace, and appends
 *  "…" only when actually truncated. */
export function plainTextPreview(text: string, max = PREVIEW_DESCRIPTION_MAX): string {
  const flat = text
    .replace(/```[\s\S]*?```/g, ' ')
    .replace(/`/g, '')
    .replace(/\s+/g, ' ')
    .trim();
  return flat.length > max ? `${flat.slice(0, max).trimEnd()}…` : flat;
}

/**
 * Counts + a deterministically ordered preview of EVERY one of one review's
 * findings — the payload behind `PrMeta.findings` on the PR list. The
 * popover scrolls, so there's no reason to truncate the list itself (only
 * each description is length-capped, via `plainTextPreview`). Ordered
 * CRITICAL → WARNING → SUGGESTION, then file, then start line, so it never
 * reshuffles between identical requests.
 */
export function toFindingsRollup(rows: FindingRollupRow[]): PrFindingsRollup {
  const counts = rollupSeverities(rows);
  const preview = [...rows]
    .sort((a, b) => {
      const rank = (SEVERITY_RANK[a.severity] ?? 9) - (SEVERITY_RANK[b.severity] ?? 9);
      if (rank !== 0) return rank;
      const file = a.file.localeCompare(b.file);
      if (file !== 0) return file;
      return a.startLine - b.startLine;
    })
    .map((r) => ({
      severity: r.severity as PrFindingsRollup['preview'][number]['severity'],
      category: r.category as PrFindingsRollup['preview'][number]['category'],
      title: r.title,
      file: r.file,
      start_line: r.startLine,
      end_line: r.endLine,
      confidence: r.confidence,
      description: plainTextPreview(r.rationale),
    }));
  return { ...counts, total: rows.length, preview };
}

/**
 * Review-freshness status for the PR list. Merged/closed PRs keep their GitHub
 * merge state; open PRs map to:
 *  - `needs_review` — never reviewed, OR head moved since the last review
 *  - `stale`        — current head was reviewed but the PR is older than STALE_DAYS
 *  - `reviewed`     — current head reviewed and recent
 */
export function deriveReviewStatus(args: {
  /** DB `status` column = GitHub merge state (open/merged/closed). */
  ghStatus: string;
  lastReviewedSha: string | null;
  headSha: string;
  updatedAt: Date | null;
  now: number;
  staleDays?: number;
}): PrStatus {
  const { ghStatus, lastReviewedSha, headSha, updatedAt, now } = args;
  if (ghStatus === 'merged' || ghStatus === 'closed') return ghStatus as PrStatus;
  if (!lastReviewedSha || lastReviewedSha !== headSha) return 'needs_review';
  const staleMs = (args.staleDays ?? STALE_DAYS) * 86_400_000;
  if (updatedAt && now - updatedAt.getTime() > staleMs) return 'stale';
  return 'reviewed';
}
