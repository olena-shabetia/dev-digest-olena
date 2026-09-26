import { z } from 'zod';
import { IntentConfidence } from '@devdigest/shared';

/** Route-local request body for `POST /pulls/:id/intent`. */
export const DeriveIntentBody = z.object({
  force: z.boolean().default(false),
});
export type DeriveIntentBody = z.infer<typeof DeriveIntentBody>;

/**
 * Structured-output schema for the derivation LLM call
 * (`completeStructured`). `sources` is deliberately NOT here — our code
 * owns that field entirely (see `sources.ts#buildIntentSources`); the model
 * is never asked to report which inputs it saw, and `confidence` is only a
 * PROPOSAL — `helpers.ts#clampConfidence` caps it before persistence.
 */
export const IntentExtraction = z.object({
  intent: z.string().min(1).max(500),
  in_scope: z.array(z.string().min(1).max(300)).max(20),
  out_of_scope: z.array(z.string().min(1).max(300)).max(20),
  context_gaps: z.array(z.string().min(1).max(300)).max(10),
  confidence: IntentConfidence,
});
export type IntentExtraction = z.infer<typeof IntentExtraction>;
