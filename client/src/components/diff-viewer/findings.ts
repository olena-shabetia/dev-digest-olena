/** Inline-finding support for the DiffViewer (Smart Diff, L03). Pure helpers +
 *  the API shape the viewer needs to render a FindingCard beneath the code
 *  line it's anchored to. Mirrors comments.ts's DiffCommentApi/keysForLine
 *  pattern so CodeLine matches findings the exact same way it matches
 *  comment threads, without re-deriving a line number anywhere. */
import type { FindingActionKind, FindingRecord, Severity } from "@devdigest/shared";
import { lineKey } from "./comments";
import { SEVERITY_ORDER } from "@/lib/severity";

/** What the viewer needs to render inline findings under diff lines. */
export interface DiffFindingsApi {
  /** Keyed by PrFile.path — this file's findings, unfiltered. */
  byPath: Map<string, FindingRecord[]>;
  /** Pre-translated per-severity line labels (never a literal in diff-viewer). */
  lineLabels: { CRITICAL: string; WARNING: string; SUGGESTION: string };
  /** Pre-translated "{count} findings" a11y label for the file-header dot. */
  fileFindingsLabel: (count: number) => string;
  repoFullName?: string | null;
  headSha?: string | null;
  onAction?: (findingId: string, action: FindingActionKind, reply?: string) => void;
  pendingFindingId?: string | null;
}

/**
 * Anchor a file's findings to the same `RIGHT:<line>` keys `keysForLine`
 * already produces for comment threading, so CodeLine can look them up
 * without re-deriving a line number. Multiple findings on one line are kept
 * in a list, in the order they were given.
 */
export function anchorFindings(findings: FindingRecord[]): Map<string, FindingRecord[]> {
  const out = new Map<string, FindingRecord[]>();
  for (const f of findings) {
    const key = lineKey("RIGHT", f.start_line);
    if (!key) continue;
    const list = out.get(key) ?? [];
    list.push(f);
    out.set(key, list);
  }
  return out;
}

/**
 * The most severe severity among a line's anchored findings (CRITICAL >
 * WARNING > SUGGESTION > INFO) — determines the left color bar and the
 * right-aligned label when a line carries findings of mixed severity.
 * Returns null for an empty list.
 */
export function highestSeverity(findings: FindingRecord[]): Severity | null {
  if (findings.length === 0) return null;
  return findings.reduce<Severity>((worst, f) => {
    const a = SEVERITY_ORDER[worst] ?? Number.MAX_SAFE_INTEGER;
    const b = SEVERITY_ORDER[f.severity] ?? Number.MAX_SAFE_INTEGER;
    return b < a ? (f.severity as Severity) : worst;
  }, findings[0]!.severity as Severity);
}
