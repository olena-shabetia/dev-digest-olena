import type {
  OnboardingCommand,
  OnboardingDirFact,
  OnboardingFactComponent,
  OnboardingPackageManager,
  OnboardingRanking,
  OnboardingReadingItem,
  OnboardingSkeletonReason,
  OnboardingTourContent,
  OnboardingTourStatus,
} from '@devdigest/shared';

/** Minimal pino-shaped logger so the service never imports fastify. */
export interface OnboardingLogger {
  info(obj: Record<string, unknown>, msg: string): void;
  warn(obj: Record<string, unknown>, msg: string): void;
}

// ---- Manifest facts (AC-9, AC-10) -------------------------------------------
export interface ManifestFact {
  path: string;
  name: string | null;
  dependencies: string[];
  scripts: string[];
}

export interface ManifestSkip {
  path: string;
  reason: 'missing' | 'too_large' | 'invalid_json' | 'unreadable';
}

export interface ManifestFacts {
  manifests: ManifestFact[];
  skipped: ManifestSkip[];
  packageManager: OnboardingPackageManager;
  hasEnvExample: boolean;
  hasCompose: boolean;
  hasReadme: boolean;
  /** Script names of the ROOT manifest only (AC-16). */
  rootScripts: string[];
}

// ---- Structural stand-ins for repo-intel types (helpers may not import them) --
export interface PageRankLike {
  path: string;
  pagerank: number;
}

export interface DirCountLike {
  dir: string;
  files: number;
}

export interface IndexStateLike {
  status: 'full' | 'partial' | 'degraded' | 'failed';
  filesIndexed: number;
  lastIndexedSha: string;
  updatedAt: Date;
}

// ---- LLM facts budget (AC-21, AC-22) ------------------------------------------
export interface FactsBlock {
  label: string;
  text: string;
}

/**
 * One input to `budgetFactsPayload`. `component: null` is never dropped.
 * When a droppable component has a `fallback`, dropping it swaps the block for
 * the fallback (e.g. manifests without dependency names) instead of removing it.
 */
export interface FactsComponent {
  component: OnboardingFactComponent | null;
  block: FactsBlock;
  fallback?: FactsBlock;
}

export interface BudgetedFacts {
  blocks: FactsBlock[];
  chars: number;
  dropped: OnboardingFactComponent[];
}

// ---- Persistence row (mirrors the `onboarding` table; NOT $inferSelect) --------
export interface OnboardingRow {
  repoId: string;
  workspaceId: string;
  json: unknown;
  generatedAt: Date;
  status: OnboardingTourStatus;
  reason: string | null;
  indexSha: string | null;
  provider: string | null;
  model: string | null;
  llmCalls: number | null;
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;
}

// ---- Skeleton / outcome ---------------------------------------------------------
export interface SkeletonInput {
  structure: OnboardingDirFact[];
  stack: string[];
  criticalPaths: string[];
  packageManager: OnboardingPackageManager | null;
  commands: OnboardingCommand[];
  reading: OnboardingReadingItem[];
  ranking: OnboardingRanking;
  indexPartial: boolean;
  filesIndexed: number;
  droppedComponents: OnboardingFactComponent[];
  errorClass: string | null;
}

/** What one generation produced, before it is written to the table. */
export interface GenerationOutcome {
  status: OnboardingTourStatus;
  reason: OnboardingSkeletonReason | null;
  content: OnboardingTourContent;
  indexSha: string | null;
  provider: string | null;
  model: string | null;
  llmCalls: number | null;
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;
  factsChars: number;
  manifestSkips: ManifestSkip[];
}

export interface GenerationLogInput {
  workspaceId: string;
  repoId: string;
  outcome: GenerationOutcome;
  durationMs: number;
}
