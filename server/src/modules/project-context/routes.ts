/**
 * L05 — project-context HTTP module. Read-only listing + single-doc preview:
 *   GET /repos/:id/context      → 200 ProjectContextListing
 *   GET /repos/:id/context/file → 200 SpecFile (full, uncapped content)
 *
 * No `container.projectContext` getter (D3): nothing outside this module
 * consumes `ProjectContextService`, so it is constructed inline here, the
 * same pattern as `blast/routes.ts` and `pr-history/routes.ts`.
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { ContextFileQuery, ProjectContextListing, SpecFile } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { ProjectContextService } from './service.js';

export default async function projectContextRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new ProjectContextService(container);

  app.get(
    '/repos/:id/context',
    { schema: { params: IdParams, response: { 200: ProjectContextListing } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.list(workspaceId, req.params.id);
    },
  );

  app.get(
    '/repos/:id/context/file',
    { schema: { params: IdParams, querystring: ContextFileQuery, response: { 200: SpecFile } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.file(workspaceId, req.params.id, req.query.path);
    },
  );
}
