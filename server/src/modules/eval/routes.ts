/**
 * L06 — eval HTTP module. Handlers only resolve the workspace and delegate to
 * one service call; validation and business rules live in the services.
 *
 *   GET    /findings/:id/eval-draft        → draft (or existing case) for a decided finding
 *   POST   /eval-cases/draft-run           → run the unsaved draft once
 *   POST   /eval-cases                     → save a case
 *   GET    /eval-cases/:id                 → one case
 *   PUT    /eval-cases/:id                 → edit a case
 *   DELETE /eval-cases/:id                 → delete a case
 *   GET    /agents/:id/eval-cases          → an agent's cases + pass count
 *   POST   /agents/:id/eval-runs           → start (or reuse) a set run, 202
 *   GET    /agents/:id/eval-runs           → run history + latest metrics (polled)
 *   GET    /eval-runs/compare?base&head    → two-run comparison (before /eval-runs/:id)
 *   GET    /eval-runs/:id                  → one run with results
 *   GET    /eval/dashboard                 → dashboard index
 *
 * POST /agents/:id/eval-runs declares no body schema: a body-less POST arrives
 * as `null` (server/INSIGHTS.md, 2026-09-21). Services are built here, no
 * container getter (plan D-6).
 */
import type { FastifyInstance } from 'fastify';
import type { ZodTypeProvider } from 'fastify-type-provider-zod';
import { z } from 'zod';
import {
  EvalAgentRunsResponse,
  EvalCaseCreateRequest,
  EvalCaseDetail,
  EvalCaseDraftResponse,
  EvalCaseListResponse,
  EvalCaseUpdateRequest,
  EvalDashboardIndex,
  EvalDraftRunRequest,
  EvalDraftRunResult,
  EvalRunCompare,
  EvalSetRun,
  EvalSetRunStarted,
} from '@devdigest/shared';
import { getContext } from '../_shared/context.js';
import { IdParams } from '../_shared/schemas.js';
import { EVAL_RATE_LIMIT } from './constants.js';
import { EvalService } from './service.js';
import { EvalRunService } from './run-service.js';

const Ok = z.object({ ok: z.boolean() });
const CompareQuery = z.object({ base: z.string().uuid(), head: z.string().uuid() });

export default async function evalRoutes(appBase: FastifyInstance) {
  const app = appBase.withTypeProvider<ZodTypeProvider>();
  const { container } = app;
  const cases = new EvalService(container);
  const runs = new EvalRunService(container);

  app.get(
    '/findings/:id/eval-draft',
    { schema: { params: IdParams, response: { 200: EvalCaseDraftResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return cases.draftForFinding(workspaceId, req.params.id);
    },
  );

  app.post(
    '/eval-cases/draft-run',
    {
      schema: { body: EvalDraftRunRequest, response: { 200: EvalDraftRunResult } },
      config: { rateLimit: EVAL_RATE_LIMIT },
    },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return cases.draftRun(workspaceId, req.body);
    },
  );

  app.post(
    '/eval-cases',
    { schema: { body: EvalCaseCreateRequest, response: { 201: EvalCaseDetail } } },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      const created = await cases.createCase(workspaceId, req.body);
      return reply.status(201).send(created);
    },
  );

  app.get(
    '/eval-cases/:id',
    { schema: { params: IdParams, response: { 200: EvalCaseDetail } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return cases.getCase(workspaceId, req.params.id);
    },
  );

  app.put(
    '/eval-cases/:id',
    {
      schema: { params: IdParams, body: EvalCaseUpdateRequest, response: { 200: EvalCaseDetail } },
    },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return cases.updateCase(workspaceId, req.params.id, req.body);
    },
  );

  app.delete(
    '/eval-cases/:id',
    { schema: { params: IdParams, response: { 200: Ok } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      await cases.deleteCase(workspaceId, req.params.id);
      return { ok: true };
    },
  );

  app.get(
    '/agents/:id/eval-cases',
    { schema: { params: IdParams, response: { 200: EvalCaseListResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return cases.listCases(workspaceId, req.params.id);
    },
  );

  app.post(
    '/agents/:id/eval-runs',
    {
      schema: { params: IdParams, response: { 202: EvalSetRunStarted } },
      config: { rateLimit: EVAL_RATE_LIMIT },
    },
    async (req, reply) => {
      const { workspaceId } = await getContext(container, req);
      const started = await runs.startRun(workspaceId, req.params.id);
      return reply.status(202).send(started);
    },
  );

  app.get(
    '/agents/:id/eval-runs',
    { schema: { params: IdParams, response: { 200: EvalAgentRunsResponse } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return runs.listAgentRuns(workspaceId, req.params.id);
    },
  );

  // Registered before /eval-runs/:id so "compare" is never read as an id.
  app.get(
    '/eval-runs/compare',
    { schema: { querystring: CompareQuery, response: { 200: EvalRunCompare } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return runs.compare(workspaceId, req.query.base, req.query.head);
    },
  );

  app.get(
    '/eval-runs/:id',
    { schema: { params: IdParams, response: { 200: EvalSetRun } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return runs.getRun(workspaceId, req.params.id);
    },
  );

  app.get(
    '/eval/dashboard',
    { schema: { response: { 200: EvalDashboardIndex } } },
    async (req) => {
      const { workspaceId } = await getContext(container, req);
      return runs.dashboard(workspaceId);
    },
  );
}
