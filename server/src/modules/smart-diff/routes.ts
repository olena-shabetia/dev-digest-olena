/**
 * L03 — smart-diff HTTP module.
 *
 *   GET /pulls/:id/smart-diff → 200 SmartDiffResponse (pure, cheap read)
 *
 * No `container.smartDiff*` getter (D4, `server/specs/L03-smart-diff.api.md`):
 * nothing outside this module consumes `SmartDiffService`, so it is
 * constructed inline here — exactly as `intent/routes.ts` does.
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { SmartDiffResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { SmartDiffService } from './service.js';

export default async function smartDiffRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new SmartDiffService(container);

  app.get(
    '/pulls/:id/smart-diff',
    { schema: { params: IdParams, response: { 200: SmartDiffResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.getSmartDiff(workspaceId, req.params.id);
    },
  );
}
