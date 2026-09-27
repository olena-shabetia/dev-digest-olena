/**
 * L04 — blast radius HTTP module.
 *
 *   GET /pulls/:id/blast → 200 BlastRadiusResponse (best-effort, cheap read)
 *
 * No `container.blast*` getter (D3, `server/specs/L04-blast-radius.api.md`):
 * nothing outside this module consumes `BlastService`, so it is constructed
 * inline here — exactly as `smart-diff/routes.ts` does.
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { BlastRadiusResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { BlastService } from './service.js';

export default async function blastRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new BlastService(container);

  app.get(
    '/pulls/:id/blast',
    { schema: { params: IdParams, response: { 200: BlastRadiusResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.getBlastRadius(workspaceId, req.params.id);
    },
  );
}
