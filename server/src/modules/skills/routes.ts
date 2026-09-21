import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
// Side-effect import: augments FastifyRequest with `.file()` (multipart is
// registered globally in app.ts; this import only pulls in its ambient types).
import '@fastify/multipart';
import { z } from 'zod';
import { Skill, SkillImportPreview, SkillSource, SkillType, SkillVersion, SkillStats } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError, ValidationError } from '../../platform/errors.js';
import { SkillsService } from './service.js';

const Ok = z.object({ ok: z.boolean() });

/**
 * L02 — skills module.
 *   GET    /skills                  → list (workspace-scoped)
 *   GET    /skills/:id              → one skill
 *   POST   /skills                  → create (starts at version 1)
 *   PUT    /skills/:id              → update (a body change bumps version)
 *   DELETE /skills/:id              → delete (cascades versions + agent links)
 *   GET    /skills/:id/versions     → body-snapshot history (newest first)
 *   GET    /skills/:id/stats        → agents currently using this skill
 *   POST   /skills/import/preview   → parse a .md/.zip upload; writes nothing
 */

const CreateSkillBody = z.object({
  name: z.string().min(1),
  description: z.string(),
  type: SkillType,
  source: SkillSource,
  body: z.string().min(1),
  enabled: z.boolean().optional(),
  evidence_files: z.array(z.string()).optional(),
});

const UpdateSkillBody = z.object({
  name: z.string().min(1).optional(),
  description: z.string().optional(),
  type: SkillType.optional(),
  source: SkillSource.optional(),
  body: z.string().min(1).optional(),
  enabled: z.boolean().optional(),
  evidence_files: z.array(z.string()).optional(),
  /** Optional human note captured on the new skill_versions snapshot when this
   *  update changes `body`. Ignored when the update doesn't bump version. */
  change_note: z.string().nullish(),
});

export default async function skillsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const service = new SkillsService(app.container);

  app.get('/skills', { schema: { response: { 200: z.array(Skill) } } }, async (req) => {
    const { workspaceId } = await getContext(app.container, req);
    return service.list(workspaceId);
  });

  app.get(
    '/skills/:id',
    { schema: { params: IdParams, response: { 200: Skill } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const skill = await service.get(workspaceId, req.params.id);
      if (!skill) throw new NotFoundError('Skill not found');
      return skill;
    },
  );

  app.post(
    '/skills',
    { schema: { body: CreateSkillBody, response: { 201: Skill } } },
    async (req, reply) => {
      const { workspaceId } = await getContext(app.container, req);
      const body = req.body;
      const skill = await service.create(workspaceId, {
        name: body.name,
        description: body.description,
        type: body.type,
        source: body.source,
        body: body.body,
        ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
        ...(body.evidence_files !== undefined ? { evidence_files: body.evidence_files } : {}),
      });
      reply.status(201);
      return skill;
    },
  );

  app.put(
    '/skills/:id',
    { schema: { params: IdParams, body: UpdateSkillBody, response: { 200: Skill } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const body = req.body;
      const skill = await service.update(workspaceId, req.params.id, {
        ...(body.name !== undefined ? { name: body.name } : {}),
        ...(body.description !== undefined ? { description: body.description } : {}),
        ...(body.type !== undefined ? { type: body.type } : {}),
        ...(body.source !== undefined ? { source: body.source } : {}),
        ...(body.body !== undefined ? { body: body.body } : {}),
        ...(body.enabled !== undefined ? { enabled: body.enabled } : {}),
        ...(body.evidence_files !== undefined ? { evidence_files: body.evidence_files } : {}),
        ...(body.change_note !== undefined ? { change_note: body.change_note } : {}),
      });
      if (!skill) throw new NotFoundError('Skill not found');
      return skill;
    },
  );

  app.delete(
    '/skills/:id',
    { schema: { params: IdParams, response: { 200: Ok } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const ok = await service.delete(workspaceId, req.params.id);
      if (!ok) throw new NotFoundError('Skill not found');
      return { ok: true };
    },
  );

  app.get(
    '/skills/:id/versions',
    { schema: { params: IdParams, response: { 200: z.array(SkillVersion) } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const versions = await service.listVersions(workspaceId, req.params.id);
      if (!versions) throw new NotFoundError('Skill not found');
      return versions;
    },
  );

  app.get(
    '/skills/:id/stats',
    { schema: { params: IdParams, response: { 200: SkillStats } } },
    async (req) => {
      const { workspaceId } = await getContext(app.container, req);
      const stats = await service.stats(workspaceId, req.params.id);
      if (!stats) throw new NotFoundError('Skill not found');
      return stats;
    },
  );

  // Multipart upload — no zod `body` schema (that's for JSON bodies); the file
  // itself is validated by hand below. Nothing is written to the DB by this
  // route; see specs/L02-skills.md's two-step import contract.
  app.post(
    '/skills/import/preview',
    { schema: { response: { 200: SkillImportPreview } } },
    async (req) => {
      await getContext(app.container, req);
      const file = await req.file();
      if (!file) throw new ValidationError('No file uploaded');
      const buffer = await file.toBuffer();
      return service.importPreview(file.filename, buffer);
    },
  );
}
