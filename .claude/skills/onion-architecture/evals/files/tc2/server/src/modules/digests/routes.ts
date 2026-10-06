import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { DigestService } from './service.js';

const GenerateBody = z.object({
  prNumber: z.string(),
  diff: z.string().min(1),
});

const digestRoutes: FastifyPluginAsync = async (app) => {
  app.get('/repos/:repoId/digests', async (req, reply) => {
    const ws = await app.container.auth.currentWorkspace();
    const { repoId } = req.params as { repoId: string };
    const svc = new DigestService(app.container);
    const digests = await svc.listForRepo(ws.id, repoId);
    return reply.send(digests);
  });

  app.post('/repos/:repoId/digests', {
    schema: { body: GenerateBody },
  }, async (req, reply) => {
    const ws = await app.container.auth.currentWorkspace();
    const { repoId } = req.params as { repoId: string };
    const body = req.body as z.infer<typeof GenerateBody>;
    const svc = new DigestService(app.container);
    const digest = await svc.generateDigest(ws.id, repoId, body.prNumber, body.diff);
    return reply.status(201).send(digest);
  });
};

export default digestRoutes;
