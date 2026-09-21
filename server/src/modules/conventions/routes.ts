/**
 * HW2 — conventions HTTP module.
 *
 *   POST  /repos/:id/conventions/extract → 202 {scan_id, job_id}; 422 up
 *                                          front when the repo has no clone
 *   GET   /repos/:id/conventions         → {scan, candidates[]} (pure read)
 *   PATCH /conventions/:id               → {status?, rule?, category?}
 *   POST  /repos/:id/conventions/skill   → {agent_id?} → repo-conventions skill
 *
 * Job-handler registration lives here: this plugin runs once at app boot and
 * calls `ConventionsService.registerExtractJobHandler()` so the EXTRACT job
 * enqueued by `extract()` has a handler to run against. Mirrors
 * `repo-intel/routes.ts:26-31`.
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ConventionCandidate, ConventionScan, Skill } from '@devdigest/shared';
import { z } from 'zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { ConventionsService } from './service.js';
import { BuildSkillBody, ExtractAccepted, PatchConventionBody } from './schemas.js';

const ConventionsListResponse = z.object({
  scan: ConventionScan.nullable(),
  candidates: z.array(ConventionCandidate),
});

// Every field on these bodies is optional, so a body-less request (which
// Fastify/`app.inject()` deliver as `null`, not `undefined` — see
// server/INSIGHTS.md, 2026-09-21) must be coerced BEFORE the object schema
// sees it; `.default({})` only catches `undefined`, not an explicit `null`.
const PatchConventionRequest = z.preprocess((v) => v ?? {}, PatchConventionBody);
const BuildSkillRequest = z.preprocess((v) => v ?? {}, BuildSkillBody);

export default async function conventionsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new ConventionsService(container);
  service.registerExtractJobHandler();

  app.post(
    '/repos/:id/conventions/extract',
    { schema: { params: IdParams, response: { 202: ExtractAccepted } } },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      const { scanId, jobId } = await service.extract(workspaceId, req.params.id);
      reply.code(202);
      return { scan_id: scanId, job_id: jobId };
    },
  );

  app.get(
    '/repos/:id/conventions',
    { schema: { params: IdParams, response: { 200: ConventionsListResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.getConventions(workspaceId, req.params.id);
    },
  );

  app.patch(
    '/conventions/:id',
    { schema: { params: IdParams, body: PatchConventionRequest, response: { 200: ConventionCandidate } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      const updated = await service.patch(workspaceId, req.params.id, req.body);
      if (!updated) throw new NotFoundError('Convention candidate not found');
      return updated;
    },
  );

  app.post(
    '/repos/:id/conventions/skill',
    { schema: { params: IdParams, body: BuildSkillRequest, response: { 200: Skill } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.buildSkill(workspaceId, req.params.id, req.body.agent_id);
    },
  );
}
