/**
 * P3 — "Prior PRs touching these files" HTTP module.
 *
 *   GET /pulls/:id/history → 200 PrHistory (best-effort, live GitHub calls)
 *
 * No `container.prHistory*` getter (same reasoning as `blast/routes.ts`'s
 * D3): nothing outside this module consumes `PrHistoryService`, so it is
 * constructed inline here.
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { PrHistory } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { PrHistoryService } from './service.js';

export default async function prHistoryRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new PrHistoryService(container);

  app.get(
    '/pulls/:id/history',
    { schema: { params: IdParams, response: { 200: PrHistory } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.getPrHistory(workspaceId, req.params.id);
    },
  );
}
