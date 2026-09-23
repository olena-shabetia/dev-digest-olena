/**
 * Pure helpers for the intent module — confidence clamping and DTO mapping.
 * No I/O; structurally typed against row shapes rather than importing
 * `./repository.js` (helpers.ts must stay a leaf —
 * `.dependency-cruiser.cjs`'s `helpers-and-constants-are-pure` rule).
 */
import type { IntentConfidence, IntentSource, PrIntentRecord } from '@devdigest/shared';

const CONFIDENCE_ORDER: IntentConfidence[] = ['low', 'medium', 'high'];

/**
 * Cap the model's proposed `confidence` against the deterministic source
 * set — the card's honesty about missing context is a property of the
 * server, never of the model's self-report (specs/L03-intent-layer.md):
 *   - no `body` AND no `issue`/`spec`/`plan` used ⇒ at most `low`
 *   - any source `unavailable` ⇒ at most `medium`
 * The model can only ever be clamped DOWN, never up.
 */
export function clampConfidence(proposed: IntentConfidence, sources: IntentSource[]): IntentConfidence {
  let cap = CONFIDENCE_ORDER.indexOf('high');

  const hasRichSource = sources.some(
    (s) => (s.kind === 'body' || s.kind === 'issue' || s.kind === 'spec' || s.kind === 'plan') && s.status === 'used',
  );
  if (!hasRichSource) cap = CONFIDENCE_ORDER.indexOf('low');

  if (sources.some((s) => s.status === 'unavailable')) {
    cap = Math.min(cap, CONFIDENCE_ORDER.indexOf('medium'));
  }

  const proposedIdx = CONFIDENCE_ORDER.indexOf(proposed);
  const finalIdx = Math.min(proposedIdx < 0 ? CONFIDENCE_ORDER.indexOf('low') : proposedIdx, cap);
  return CONFIDENCE_ORDER[finalIdx] ?? 'low';
}

/** The subset of a `pr_intent` row `toIntentDto` needs. Deliberately NOT the
 *  Drizzle row type — helpers.ts must not import repository.ts. */
export interface PrIntentRowLike {
  prId: string;
  intent: string;
  inScope: string[];
  outOfScope: string[];
  sources: IntentSource[];
  confidence: string;
  contextGaps: string[];
  headSha: string | null;
  provider: string | null;
  model: string | null;
  tokensIn: number | null;
  tokensOut: number | null;
  costUsd: number | null;
  error: string | null;
  generatedAt: Date | null;
}

/** Map a persisted `pr_intent` row to the public `PrIntentRecord` DTO.
 *  `generated_at` is ALWAYS an ISO string here, never a `Date` — the
 *  response schema's `z.string()` would 500 on a raw `Date`
 *  (server/INSIGHTS.md, fastify-type-provider-zod gotcha). */
export function toIntentDto(row: PrIntentRowLike): PrIntentRecord {
  return {
    intent: row.intent,
    in_scope: row.inScope,
    out_of_scope: row.outOfScope,
    sources: row.sources,
    confidence: row.confidence as IntentConfidence,
    context_gaps: row.contextGaps,
    pr_id: row.prId,
    head_sha: row.headSha,
    provider: row.provider,
    model: row.model,
    tokens_in: row.tokensIn,
    tokens_out: row.tokensOut,
    cost_usd: row.costUsd,
    error: row.error,
    generated_at: row.generatedAt ? row.generatedAt.toISOString() : null,
  };
}
