/**
 * Pure helpers for the conventions module — evidence verification, dedupe,
 * DTO mapping, and skill-markdown rendering. No I/O; structurally typed
 * against row shapes rather than importing `./repository.js` (helpers.ts
 * must stay a leaf — `.dependency-cruiser.cjs`'s
 * `helpers-and-constants-are-pure` rule).
 */
import type { ConventionCandidate, ConventionCategory, ConventionScan } from '@devdigest/shared';
import { MAX_CANDIDATES, MAX_EVIDENCES_PER_CANDIDATE } from './constants.js';
import type { MergedCandidate, RawCandidate, SampledFile, VerifiedEvidence, VerifiedOccurrence } from './types.js';

// ---------------------------------------------------------------------------
// Path / rule normalization
// ---------------------------------------------------------------------------

/** Strip a leading `./`, collapse backslashes, drop any leading slash. */
export function normalizeRelPath(path: string): string {
  return path.trim().replace(/\\/g, '/').replace(/^\.\//, '').replace(/^\/+/, '');
}

/** Case/whitespace-insensitive key for grouping duplicate rules. */
export function normalizeRuleText(rule: string): string {
  return rule.trim().toLowerCase().replace(/\s+/g, ' ');
}

// ---------------------------------------------------------------------------
// Verification — the code-side gate every LLM-cited candidate must survive.
// ---------------------------------------------------------------------------

/**
 * Verify one raw candidate's cited evidence against the sampled files.
 * Rejects (`null`) unless: the path normalises to one of the sampled files
 * (the verification allowlist — never a file the model wasn't shown), the
 * cited line is in `[1, lines.length]`, and that line is non-blank. The
 * snippet captured is ALWAYS re-read from the file (±2 lines of context for
 * display), never trusted from the model.
 */
export function verifyEvidence(
  candidate: RawCandidate,
  sampledByPath: Map<string, SampledFile>,
  sha: string | null,
): VerifiedOccurrence | null {
  const path = normalizeRelPath(candidate.evidence.file);
  const sample = sampledByPath.get(path);
  if (!sample) return null; // not in the allowlist the model was shown

  const line = candidate.evidence.line;
  if (!Number.isInteger(line) || line < 1 || line > sample.lines.length) return null;

  const cited = sample.lines[line - 1] ?? '';
  if (cited.trim().length === 0) return null; // blank line — nothing to cite

  const start = Math.max(0, line - 1 - 2);
  const end = Math.min(sample.lines.length, line - 1 + 2 + 1);
  const snippet = sample.lines.slice(start, end).join('\n');

  return {
    path,
    line,
    snippet,
    sha,
    category: candidate.category,
    rule: candidate.rule,
    confidence: candidate.confidence,
  };
}

// ---------------------------------------------------------------------------
// Dedupe / merge
// ---------------------------------------------------------------------------

/**
 * Merge verified occurrences by `(category, normalized rule)` into one
 * candidate per distinct rule: `evidences` = every verified occurrence for
 * that rule (primary = highest `rankOf`, capped), `confidence` = the MAX of
 * the merged set (independent sightings support a rule, they don't weaken
 * it). Capped to `MAX_CANDIDATES`, sorted by confidence desc then evidence
 * count desc.
 */
export function dedupeCandidates(
  occurrences: VerifiedOccurrence[],
  rankOf: (path: string) => number,
): MergedCandidate[] {
  const groups = new Map<string, { category: ConventionCategory; rule: string; items: VerifiedOccurrence[] }>();
  for (const occ of occurrences) {
    const key = `${occ.category}::${normalizeRuleText(occ.rule)}`;
    const existing = groups.get(key);
    if (existing) {
      existing.items.push(occ);
    } else {
      groups.set(key, { category: occ.category, rule: occ.rule, items: [occ] });
    }
  }

  const merged: MergedCandidate[] = [...groups.values()].map((g) => {
    const sortedEvidence = [...g.items]
      .sort((a, b) => rankOf(b.path) - rankOf(a.path))
      .slice(0, MAX_EVIDENCES_PER_CANDIDATE)
      .map((e): VerifiedEvidence => ({ path: e.path, line: e.line, snippet: e.snippet, sha: e.sha }));
    const confidence = Math.max(...g.items.map((i) => i.confidence));
    return { category: g.category, rule: g.rule, confidence, evidences: sortedEvidence };
  });

  return merged
    .sort((a, b) => b.confidence - a.confidence || b.evidences.length - a.evidences.length)
    .slice(0, MAX_CANDIDATES);
}

// ---------------------------------------------------------------------------
// DTO mapping
// ---------------------------------------------------------------------------

/** The subset of a `conventions` row `toConventionDto` needs. Deliberately
 *  NOT the Drizzle row type — helpers.ts must not import repository.ts. */
export interface ConventionRowLike {
  id: string;
  repoId: string | null;
  scanId: string | null;
  category: string;
  rule: string;
  evidencePath: string | null;
  evidenceLine: number | null;
  evidenceSnippet: string | null;
  evidenceSha: string | null;
  evidences: unknown;
  confidence: number | null;
  status: string;
  edited: boolean;
  createdAt: Date;
}

export interface RepoBlobRef {
  owner: string;
  name: string;
}

/** Derived GitHub blob URL for one evidence occurrence — `null` whenever
 *  `sha` or `line` is missing (never stored on the row). */
export function blobUrl(repo: RepoBlobRef, sha: string | null, path: string, line: number | null): string | null {
  if (!sha || line == null) return null;
  return `https://github.com/${repo.owner}/${repo.name}/blob/${sha}/${path}#L${line}`;
}

/** Map a persisted `conventions` row + its owning repo to the public
 *  `ConventionCandidate` DTO. `evidence_url`/`evidences[].url` are derived
 *  here from `sha`+`line`, never read off a stored column. */
export function toConventionDto(row: ConventionRowLike, repo: RepoBlobRef): ConventionCandidate {
  const storedEvidences = Array.isArray(row.evidences) ? (row.evidences as VerifiedEvidence[]) : [];
  return {
    id: row.id,
    repo_id: row.repoId ?? '',
    scan_id: row.scanId,
    category: row.category as ConventionCategory,
    rule: row.rule,
    evidence_path: row.evidencePath ?? '',
    evidence_line: row.evidenceLine,
    evidence_snippet: row.evidenceSnippet ?? '',
    evidence_sha: row.evidenceSha,
    evidence_url: blobUrl(repo, row.evidenceSha, row.evidencePath ?? '', row.evidenceLine),
    evidences: storedEvidences.map((e) => ({
      path: e.path,
      line: e.line,
      snippet: e.snippet,
      sha: e.sha,
      url: blobUrl(repo, e.sha, e.path, e.line),
    })),
    confidence: row.confidence ?? 0,
    status: row.status as ConventionCandidate['status'],
    edited: row.edited,
    created_at: row.createdAt.toISOString(),
  };
}

export interface ScanRowLike {
  id: string;
  repoId: string;
  status: string;
  sha: string | null;
  provider: string | null;
  model: string | null;
  candidatesProposed: number;
  candidatesVerified: number;
  degraded: boolean;
  degradedReason: string | null;
  createdAt: Date;
}

export function toScanDto(row: ScanRowLike): ConventionScan {
  return {
    id: row.id,
    repo_id: row.repoId,
    status: row.status as ConventionScan['status'],
    sha: row.sha,
    provider: row.provider,
    model: row.model,
    candidates_proposed: row.candidatesProposed,
    candidates_verified: row.candidatesVerified,
    degraded: row.degraded,
    degraded_reason: row.degradedReason,
    created_at: row.createdAt.toISOString(),
  };
}

// ---------------------------------------------------------------------------
// Skill body rendering
// ---------------------------------------------------------------------------

/** Group DTOs by category, preserving first-seen order within each group. */
export function groupByCategory(candidates: ConventionCandidate[]): Map<ConventionCategory, ConventionCandidate[]> {
  const out = new Map<ConventionCategory, ConventionCandidate[]>();
  for (const c of candidates) {
    const arr = out.get(c.category);
    if (arr) arr.push(c);
    else out.set(c.category, [c]);
  }
  return out;
}

/**
 * Render the accepted-only candidates into the `repo-conventions` skill body:
 * grouped by category, each rule carrying up to 3 evidence links (never
 * repeating the rule per evidence — see server/INSIGHTS.md-style merge note
 * in the plan).
 */
export function buildSkillMarkdown(accepted: ConventionCandidate[], repoLabel: string): string {
  if (accepted.length === 0) {
    return `# Repo conventions — ${repoLabel}\n\nNo accepted conventions yet.`;
  }
  const groups = groupByCategory(accepted);
  const sections: string[] = [`# Repo conventions — ${repoLabel}`];
  for (const [category, items] of groups) {
    sections.push(`## ${category}`);
    for (const item of items) {
      const links = item.evidences
        .slice(0, 3)
        .map((e) => (e.url ? `[${e.path}:${e.line}](${e.url})` : `${e.path}:${e.line ?? '?'}`))
        .join(' · ');
      sections.push(`- *${item.rule}*${links ? `\n  - Evidence: ${links}` : ''}`);
    }
  }
  return sections.join('\n\n');
}

/** Every distinct evidence path across a set of candidates (for the skill's
 *  `evidence_files`), deduped, order-preserving. */
export function collectEvidenceFiles(candidates: ConventionCandidate[]): string[] {
  const seen = new Set<string>();
  const out: string[] = [];
  for (const c of candidates) {
    for (const e of c.evidences) {
      if (seen.has(e.path)) continue;
      seen.add(e.path);
      out.push(e.path);
    }
  }
  return out;
}
