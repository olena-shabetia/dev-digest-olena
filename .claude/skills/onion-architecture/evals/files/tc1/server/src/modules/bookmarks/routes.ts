import { eq, and } from 'drizzle-orm';
import type { FastifyPluginAsync } from 'fastify';
import { z } from 'zod';
import * as t from '../../db/schema.js';

const CreateBookmarkBody = z.object({
  url: z.string().url(),
  title: z.string().min(1),
  tags: z.array(z.string()).default([]),
});

const bookmarksRoutes: FastifyPluginAsync = async (app) => {
  app.get('/bookmarks', async (req, reply) => {
    const ws = await app.container.auth.currentWorkspace();
    const rows = await app.container.db
      .select()
      .from(t.bookmarks)
      .where(eq(t.bookmarks.workspaceId, ws.id));
    return reply.send(rows);
  });

  app.post('/bookmarks', {
    schema: { body: CreateBookmarkBody },
  }, async (req, reply) => {
    const ws = await app.container.auth.currentWorkspace();
    const user = await app.container.auth.currentUser();
    const body = req.body as z.infer<typeof CreateBookmarkBody>;

    const existing = await app.container.db
      .select()
      .from(t.bookmarks)
      .where(and(eq(t.bookmarks.workspaceId, ws.id), eq(t.bookmarks.url, body.url)));

    if (existing.length > 0) {
      return reply.status(409).send({ error: { code: 'conflict', message: 'Bookmark already exists' } });
    }

    const [row] = await app.container.db
      .insert(t.bookmarks)
      .values({ ...body, workspaceId: ws.id, createdBy: user.id })
      .returning();

    return reply.status(201).send(row);
  });

  app.delete('/bookmarks/:id', async (req, reply) => {
    const ws = await app.container.auth.currentWorkspace();
    const { id } = req.params as { id: string };

    await app.container.db
      .delete(t.bookmarks)
      .where(and(eq(t.bookmarks.id, id), eq(t.bookmarks.workspaceId, ws.id)));

    return reply.status(204).send();
  });
};

export default bookmarksRoutes;
