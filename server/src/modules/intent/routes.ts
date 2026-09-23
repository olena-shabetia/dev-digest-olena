/**
 * L03 — intent HTTP module.
 *
 *   GET  /pulls/:id/intent → 200 {PrIntentRecord | null} (pure DB read)
 *   POST /pulls/:id/intent → 200 {PrIntentRecord} (manual re-derive)
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { PrIntentRecord } from '@devdigest/shared';
import { z } from 'zod';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { IntentService } from './service.js';
import { DeriveIntentBody } from './schemas.js';

// A body-less request (Fastify/`app.inject()` delivers one as `null`, not
// `undefined` — server/INSIGHTS.md, 2026-09-21) must be coerced BEFORE the
// object schema sees it; `.default({})` only catches `undefined`.
const DeriveIntentRequest = z.preprocess((v) => v ?? {}, DeriveIntentBody);

export default async function intentRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new IntentService(container);

  app.get(
    '/pulls/:id/intent',
    { schema: { params: IdParams, response: { 200: PrIntentRecord.nullable() } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.getIntent(workspaceId, req.params.id);
    },
  );

  app.post(
    '/pulls/:id/intent',
    {
      schema: { params: IdParams, body: DeriveIntentRequest, response: { 200: PrIntentRecord } },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.deriveIntent(workspaceId, req.params.id, req.body.force);
    },
  );
}
