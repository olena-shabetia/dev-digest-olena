import type { BlastRadius, BriefDataGap, Intent, SmartDiffRole } from '@devdigest/shared';
import type { BRIEF_DROP_ORDER } from './constants.js';

/** New-side line range of one diff hunk (inclusive). */
export interface HunkRange {
  start: number;
  end: number;
}

export type BriefDroppedComponent = (typeof BRIEF_DROP_ORDER)[number];

export interface BriefFactBlock {
  label: string;
  text: string;
}

export interface BriefFactsInput {
  title: string;
  description: string;
  intent: Intent | null;
  blast: BlastRadius | null;
  files: {
    path: string;
    additions: number;
    deletions: number;
    role: SmartDiffRole;
    hunks: HunkRange[];
  }[];
  totalFiles: number;
  findings: { file: string; line: number; severity: string }[];
  specs: { path: string; content: string }[];
}

export interface BriefFacts {
  blocks: BriefFactBlock[];
  factsChars: number;
  dataGaps: BriefDataGap[];
  dropped: BriefDroppedComponent[];
}

/** Minimal logger shape injected by routes.ts (keeps HTTP-framework types out of the service). */
export interface BriefLogger {
  info(obj: object, msg: string): void;
  warn(obj: object, msg: string): void;
}
