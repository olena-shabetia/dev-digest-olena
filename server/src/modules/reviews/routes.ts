import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  ActiveRun,
  AgentRunEstimate,
  FindingRecord,
  MultiAgentRunDetail,
  MultiAgentRunListItem,
  ReviewRecord,
  ReviewRunResponse,
  RunRequest,
  RunSummary,
  RunTrace,
} from '@devdigest/shared';
import type { RunEvent } from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { NotFoundError } from '../../platform/errors.js';
import { ReviewService } from './service.js';
import { MultiRunService } from './multi-run.service.js';

const Ok = z.object({ ok: z.boolean() });

/**
 * reviews module.
 *   POST   /pulls/:id/review        {agentId} | {all:true} | {agentIds:[…]}  → run review(s); returns runs (L07: agentIds → multi_agent_run_id)
 *   GET    /runs/:id/events                                                   → SSE stream of RunEvent (replay-first)
 *   GET    /runs/:id/trace                                                    → the single-document RunTrace
 *   GET    /pulls/:id/reviews                                                 → persisted reviews + findings for a PR
 *   POST   /findings/:id/(accept|dismiss)                                     → finding actions
 *   GET    /multi-agent-runs/:id                                              → L07 batch detail (read model; MultiRunService)
 *   GET    /repos/:id/multi-agent-runs                                        → L07 batch list for a repo
 *   GET    /agent-run-estimates                                               → L07 per-agent duration/cost estimates
 */
const FINDING_ACTIONS = ['accept', 'dismiss'] as const;
export default async function reviewsRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const service = new ReviewService(container);
  // L07 — no container getter (server/INSIGHTS.md 2026-09-22, `no-circular`):
  // constructed inline, same as `service` above.
  const multiRun = new MultiRunService(container);

  // ---- Run a review (manual trigger) -------------------------------
  // Tight per-route limit: each call can fan out to expensive LLM runs.
  // A fully empty request (both fields are optional anyway) must still
  // reach resolveTargets(), which is what turns "neither provided" into the
  // friendlier 400 'invalid_run_request' instead of a schema-level 422.
  // `.default({})` alone is NOT enough: an empty-body POST arrives as
  // `null` (not `undefined`) once it passes through Fastify's body parser,
  // and Zod's `.default()` only substitutes for `undefined`. `z.preprocess`
  // normalizes both "no body at all" (undefined) and "empty body" (null) to
  // `{}` before RunRequest ever sees them.
  const RunRequestBody = z.preprocess((v) => v ?? {}, RunRequest);
  app.post(
    '/pulls/:id/review',
    {
      schema: {
        params: IdParams,
        body: RunRequestBody,
        response: { 200: ReviewRunResponse },
      },
      config: { rateLimit: { max: 10, timeWindow: '1 minute' } },
    },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      const { runs, reviews, multi_agent_run_id } = await service.startReview(
        workspaceId,
        req.params.id,
        req.body,
        req.log,
      );
      return { pr_id: req.params.id, runs, reviews, multi_agent_run_id };
    },
  );

  // ---- SSE: live run events (replay buffer first, then live; ends on done) -
  // No rate limit: SSE is one long-lived connection, not burst traffic.
  app.get(
    '/runs/:id/events',
    { schema: { params: IdParams }, config: { rateLimit: false } },
    async (req, reply) => {
      await getContext(container, req);
      const runId = req.params.id;

      reply.sse(
        (async function* () {
          // Bridge the in-memory RunBus to an async iterator the SSE plugin drains.
          const queue: RunEvent[] = [];
          let resolve: (() => void) | null = null;
          let done = false;

          const unsubscribe = container.runBus.subscribe(runId, (e) => {
            queue.push(e);
            resolve?.();
          });
          const offDone = container.runBus.onDone(runId, () => {
            done = true;
            resolve?.();
          });

          try {
            while (true) {
              if (queue.length === 0) {
                if (done) break;
                await new Promise<void>((r) => (resolve = r));
                resolve = null;
                continue;
              }
              const e = queue.shift()!;
              yield {
                id: String(e.seq),
                event: e.kind,
                data: JSON.stringify(e),
              };
            }
          } finally {
            unsubscribe();
            offDone();
          }
        })(),
      );
    },
  );

  // ---- Active (in-flight) runs for a PR (server source of truth) ----------
  app.get(
    '/pulls/:id/runs/active',
    { schema: { params: IdParams, response: { 200: z.array(ActiveRun) } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.activeRuns(workspaceId, req.params.id);
    },
  );

  // ---- All runs for a PR (any status; the run history, incl. failures) -----
  app.get(
    '/pulls/:id/runs',
    { schema: { params: IdParams, response: { 200: z.array(RunSummary) } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.listRuns(workspaceId, req.params.id);
    },
  );

  // ---- Delete one run from the history (+ its trace) ----------------------
  app.delete('/runs/:id', { schema: { params: IdParams, response: { 200: Ok } } }, async (req) => {
    const { workspaceId } = await getContext(container, req);
    const ok = await service.deleteRun(workspaceId, req.params.id);
    return { ok };
  });

  // ---- Cancel an in-flight run --------------------------------------------
  app.post(
    '/runs/:id/cancel',
    { schema: { params: IdParams, response: { 200: Ok } } },
    async (req) => {
      await getContext(container, req);
      await service.cancelRun(req.params.id);
      return { ok: true };
    },
  );

  // ---- Run trace (single document; A5 enriches with multi-agent/stats) ----
  app.get(
    '/runs/:id/trace',
    { schema: { params: IdParams, response: { 200: RunTrace } } },
    async (req) => {
      await getContext(container, req);
      const trace = await service.getRunTrace(req.params.id);
      if (!trace) throw new NotFoundError('Run trace not found');
      return trace;
    },
  );

  // ---- Reads --------------------------------------------------------------
  app.get(
    '/pulls/:id/reviews',
    { schema: { params: IdParams, response: { 200: z.array(ReviewRecord) } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return service.reviewsForPull(workspaceId, req.params.id);
    },
  );

  // ---- Delete a whole review run (one agent's pass) + its findings --------
  app.delete(
    '/reviews/:id',
    { schema: { params: IdParams, response: { 200: Ok } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      const ok = await service.deleteReview(workspaceId, req.params.id);
      if (!ok) throw new NotFoundError('Review not found');
      return { ok: true };
    },
  );

  // ---- L07: multi-agent batch reads (MultiRunService) ----------------------
  app.get(
    '/multi-agent-runs/:id',
    { schema: { params: IdParams, response: { 200: MultiAgentRunDetail } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return multiRun.getDetail(workspaceId, req.params.id);
    },
  );

  app.get(
    '/repos/:id/multi-agent-runs',
    { schema: { params: IdParams, response: { 200: z.array(MultiAgentRunListItem) } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return multiRun.listForRepo(workspaceId, req.params.id);
    },
  );

  app.get(
    '/agent-run-estimates',
    { schema: { response: { 200: z.array(AgentRunEstimate) } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return multiRun.estimates(workspaceId);
    },
  );

  // ---- Finding actions (accept / dismiss) ---------------------------------
  for (const action of FINDING_ACTIONS) {
    app.post(
      `/findings/:id/${action}`,
      { schema: { params: IdParams, response: { 200: z.object({ finding: FindingRecord }) } } },
      async (req) => {
        const { workspaceId } = await getContext(container, req);
        const result = await service.actOnFinding(workspaceId, req.params.id, action);
        return result;
      },
    );
  }
}
