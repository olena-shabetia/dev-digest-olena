// Local-only response shape (D6): GET /repos/:id/conventions returns this
// pair, declared inline in server/src/modules/conventions/routes.ts:25-28,
// never added to vendor/shared. Mirroring 3 lines locally here is cheaper
// than dragging that route's response type through the vendor-sync barrier.
import { z } from 'zod';
import { ConventionScan, ConventionCandidate } from '@devdigest/shared';

export const ConventionsListResponse = z.object({
  scan: ConventionScan.nullable(),
  candidates: z.array(ConventionCandidate),
});
export type ConventionsListResponse = z.infer<typeof ConventionsListResponse>;
