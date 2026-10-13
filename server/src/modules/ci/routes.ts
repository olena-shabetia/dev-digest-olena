/**
 * L07 — Export to CI HTTP module. Handlers resolve the workspace and delegate
 * to one service call; rules live in the services.
 *
 *   POST /agents/:id/ci/preview   → files + problems for the wizard's Preview
 *   POST /agents/:id/export-ci    → commit + open/reuse a PR, or return a zip
 *   GET  /agents/:id/ci           → this agent's installations + runs (ingests first)
 *   GET  /ci/runs                 → every CI run in the workspace (ingests first)
 *
 * Services are built here, no container getter (see eval/routes.ts).
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { CiAgentOverview, CiExport, CiExportInput, CiPreview, CiRunsResponse } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { CiExportService } from './service.js';
import { CiIngestService } from './ingest-service.js';

export default async function ciRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const exporter = new CiExportService(container);
  const ingest = new CiIngestService(container);

  app.post(
    '/agents/:id/ci/preview',
    { schema: { params: IdParams, body: CiExportInput, response: { 200: CiPreview } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return exporter.preview(workspaceId, req.params.id, req.body);
    },
  );

  app.post(
    '/agents/:id/export-ci',
    { schema: { params: IdParams, body: CiExportInput, response: { 200: CiExport } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return exporter.export(workspaceId, req.params.id, req.body);
    },
  );

  app.get(
    '/agents/:id/ci',
    { schema: { params: IdParams, response: { 200: CiAgentOverview } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return ingest.agentOverview(workspaceId, req.params.id);
    },
  );

  app.get('/ci/runs', { schema: { response: { 200: CiRunsResponse } } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    return ingest.listAll(workspaceId);
  });
}
