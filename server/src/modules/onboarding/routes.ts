/**
 * L05b — onboarding tour HTTP module.
 *
 *   GET  /repos/:id/onboarding           → {state, tour, index}
 *   POST /repos/:id/onboarding/generate  → 202 {job_id, reused}
 *
 * The service is built here (no container getter — conventions precedent) and
 * registers the generation job handler once at plugin load. POST has no body
 * schema: a body-less POST arrives as `null` (server/INSIGHTS.md, 2026-09-21).
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { OnboardingGenerateAccepted, OnboardingTourResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { OnboardingService } from './service.js';

export default async function onboardingRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new OnboardingService(container, app.log);
  service.registerGenerateJobHandler();

  app.get(
    '/repos/:id/onboarding',
    { schema: { params: IdParams, response: { 200: OnboardingTourResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.getTour(workspaceId, req.params.id);
    },
  );

  app.post(
    '/repos/:id/onboarding/generate',
    { schema: { params: IdParams, response: { 202: OnboardingGenerateAccepted } } },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      const accepted = await service.generate(workspaceId, req.params.id);
      reply.code(202);
      return accepted;
    },
  );
}
