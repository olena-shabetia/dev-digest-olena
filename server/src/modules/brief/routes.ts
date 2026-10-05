/**
 * L05c — PR Brief HTTP module.
 *
 *   GET  /pulls/:id/brief → 200 {PrBriefResponse} (pure DB read, never calls the LLM)
 *   POST /pulls/:id/brief → 200 {PrBriefResponse} (generate now)
 *
 * The service is built here (no container getter). POST has no body schema:
 * a body-less POST arrives as `null` (server/INSIGHTS.md, 2026-09-21).
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { PrBriefResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { BRIEF_RATE_LIMIT } from './constants.js';
import { BriefService } from './service.js';

export default async function briefRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new BriefService(container, app.log);

  app.get(
    '/pulls/:id/brief',
    { schema: { params: IdParams, response: { 200: PrBriefResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.getBrief(workspaceId, req.params.id);
    },
  );

  app.post(
    '/pulls/:id/brief',
    {
      schema: { params: IdParams, response: { 200: PrBriefResponse } },
      config: { rateLimit: BRIEF_RATE_LIMIT },
    },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.generate(workspaceId, req.params.id);
    },
  );
}
