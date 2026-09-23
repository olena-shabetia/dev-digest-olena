/** Internal (not exported to @devdigest/shared) shapes for the conventions
 *  module — the extractor pipeline's intermediate data, before it becomes a
 *  persisted row or a public DTO. */

import type { ConventionCategory } from '@devdigest/shared';

/** A file read from the clone, clamped + kept as raw (0-indexed) lines. */
export interface SampledFile {
  /** Repo-relative, normalized (no leading `./`, forward slashes). */
  path: string;
  lines: string[];
}

/** One raw candidate as returned by the extraction LLM call — NOT yet
 *  verified against the clone. */
export interface RawCandidate {
  category: ConventionCategory;
  rule: string;
  rationale?: string;
  evidence: { file: string; line: number };
  confidence: number;
}

/** A single verified occurrence (code-side confirmed) of a candidate rule.
 *  No `url` — that is derived in the DTO mapper from `sha`+`line`, never
 *  stored (server/specs/L02-conventions-extractor.api.md). */
export interface VerifiedEvidence {
  path: string;
  line: number;
  snippet: string;
  sha: string | null;
}

/** One verified occurrence, still tagged with its source candidate's
 *  category/rule/confidence — the pre-dedupe shape `dedupeCandidates` groups. */
export interface VerifiedOccurrence extends VerifiedEvidence {
  category: ConventionCategory;
  rule: string;
  confidence: number;
}

/** A deduped candidate, ready to persist (repository maps this to columns). */
export interface MergedCandidate {
  category: ConventionCategory;
  rule: string;
  confidence: number;
  evidences: VerifiedEvidence[]; // primary first, capped
}

/** Minimal repo shape the extractor needs (clone path + GitHub blob-url parts). */
export interface RepoCloneInfo {
  id: string;
  owner: string;
  name: string;
  defaultBranch: string;
  clonePath: string | null;
}
