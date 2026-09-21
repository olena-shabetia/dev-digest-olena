import { z } from 'zod';

/**
 * Route-local response schema for `POST /repos/:id/resync`. Not in
 * `@devdigest/shared` — the client only reads `{status: string}` off this
 * response (hooks/repo-intel.ts) and doesn't need the discriminated union
 * below; keeping it local avoids exporting a shape the client doesn't
 * consume. Mirrors the two literals returned by `repo-intel/routes.ts`.
 */
export const ResyncAccepted = z.union([
  z.object({ status: z.literal('accepted'), jobId: z.string() }),
  z.object({
    status: z.literal('accepted'),
    degraded: z.literal(true),
    reason: z.literal('no_handler'),
  }),
]);
export type ResyncAccepted = z.infer<typeof ResyncAccepted>;
