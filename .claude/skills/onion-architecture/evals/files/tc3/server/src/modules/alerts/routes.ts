import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import { AlertService } from './service.js';

const CreateChannelBody = z.object({
  name: z.string().min(1),
  webhookUrl: z.string().url(),
  signingSecret: z.string().min(8),
});

const alertRoutes: FastifyPluginAsync = async (app) => {
  app.get('/alert-channels', async (req, reply) => {
    const ws = await app.container.auth.currentWorkspace();
    const svc = new AlertService(app.container);
    return reply.send(await svc.listChannels(ws.id));
  });

  app.post('/alert-channels', {
    schema: { body: CreateChannelBody },
  }, async (req, reply) => {
    const ws = await app.container.auth.currentWorkspace();
    const body = req.body as z.infer<typeof CreateChannelBody>;
    const svc = new AlertService(app.container);
    const channel = await svc.createChannel(ws.id, body);
    return reply.status(201).send(channel);
  });
};

export default alertRoutes;
