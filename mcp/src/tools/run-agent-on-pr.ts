// `run_agent_on_pr` — the ONLY write tool in this package (mcp/AGENTS.md).
// Algorithm frozen in plan §3.6: resolvePull -> resolveAgent (+D9 disabled
// check) -> activeRuns (D10 attach-to-active) -> startReview -> waitForRun.
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { RunSummary } from '@devdigest/shared';
import { formatReviewResult, sanitizeText } from '../format.js';
import { toErrorResult, ToolError } from '../errors.js';
import { waitForRun, type RunRef } from '../runs.js';
import type { ResolvedPr } from '../resolve.js';
import type { ToolDeps } from '../server.js';

/** Builds the frozen `run_failed` / `run_cancelled` messages (plan §3.5) from
 *  a terminal `RunSummary`. Shared with get-findings.ts, which hits the same
 *  two terminal states when polling a run started elsewhere in the session. */
export function runOutcomeError(run: RunSummary): ToolError {
  if (run.status === 'cancelled') {
    return new ToolError(
      `Review run ${run.run_id} was cancelled (in the DevDigest UI). Call run_agent_on_pr again if you still need it.`,
      'run_cancelled',
    );
  }
  const errorText = sanitizeText(run.error, 200);
  let message = `Review run ${run.run_id} failed: ${errorText}.`;
  if (run.error && /key|api key|401/i.test(run.error)) {
    const provider = run.provider ?? 'unknown';
    const agentName = run.agent_name ?? 'unknown';
    message += ` Check the ${provider} API key in DevDigest Settings (agent '${agentName}' uses provider ${provider}).`;
  }
  return new ToolError(message, 'run_failed');
}

/** The frozen `RunningView` shape (plan §3.4) — returned on timeout, and by
 *  get-findings.ts when a run it looks up is still `running`. Never `isError`. */
export function buildRunningView(input: {
  runId: string;
  repo: string;
  pr: number;
  agent: string;
  elapsedMs: number;
}): {
  status: 'running';
  run_id: string;
  repo: string;
  pr: number;
  agent: string;
  elapsed_s: number;
  hint: string;
} {
  return {
    status: 'running',
    run_id: input.runId,
    repo: input.repo,
    pr: input.pr,
    agent: input.agent,
    elapsed_s: Math.round(input.elapsedMs / 1000),
    hint: 'Review still running; call get_findings with this run_id (or repo+pr) in ~30s.',
  };
}

export function registerRunAgentOnPr(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    'run_agent_on_pr',
    {
      title: 'Run agent on PR',
      description:
        'Run one DevDigest reviewer agent on an imported pull request and wait (up to ~3 min) for the result: verdict, score and top findings. Spends LLM money and creates a run visible in the DevDigest UI, so do not repeat it for the same PR; re-read results with get_findings. On timeout it returns a run_id for get_findings.',
      inputSchema: {
        repo: z.string().describe('GitHub repo as "owner/name"'),
        pr: z.coerce.number().int().positive().describe('Pull request number'),
        agent: z.string().describe('Agent name or id from list_agents'),
        severity: z
          .enum(['CRITICAL', 'WARNING', 'SUGGESTION'])
          .describe('Minimum severity to include')
          .optional(),
        limit: z.coerce
          .number()
          .int()
          .min(1)
          .max(50)
          .describe('Max findings to return (default 10, max 50)')
          .optional(),
      },
      annotations: {
        readOnlyHint: false,
        destructiveHint: false,
        idempotentHint: false,
        openWorldHint: true,
      },
    },
    async (args, extra) => {
      try {
        const resolvedPr: ResolvedPr = await deps.resolver.resolvePull(args.repo, args.pr);
        const agent = await deps.resolver.resolveAgent(args.agent);
        if (!agent.enabled) {
          throw new ToolError(
            `Agent '${agent.name}' is disabled. Enable it in the DevDigest UI or pick another from list_agents.`,
            'agent_disabled',
          );
        }

        const active = await deps.api.activeRuns(resolvedPr.prId);
        const existing = active.find((a) => a.agent_id === agent.id);

        let runId: string;
        let attached = false;
        if (existing) {
          runId = existing.run_id;
          attached = true;
        } else {
          const started = await deps.api.startReview(resolvedPr.prId, agent.id);
          const target = started.runs[0];
          if (!target) {
            throw new ToolError(
              'DevDigest API returned an unexpected response for POST /pulls/:id/review. Is the server up to date with this checkout?',
              'unexpected_shape',
            );
          }
          runId = target.run_id;
        }

        const ref: RunRef = {
          ...resolvedPr,
          runId,
          agentId: agent.id,
          agentName: agent.name,
        };
        deps.runs.remember(ref);

        const progressToken = extra._meta?.progressToken;
        const outcome = await waitForRun(deps.api, resolvedPr.prId, runId, {
          timeoutMs: deps.config.runTimeoutMs,
          intervalMs: deps.config.pollIntervalMs,
          signal: extra.signal,
          onProgress:
            progressToken != null
              ? (elapsedMs: number) => {
                  void extra.sendNotification({
                    method: 'notifications/progress',
                    params: {
                      progressToken,
                      progress: Math.round(elapsedMs / 1000),
                      total: Math.round(deps.config.runTimeoutMs / 1000),
                    },
                  });
                }
              : undefined,
        });

        if (outcome.kind === 'timeout') {
          const view = buildRunningView({
            runId,
            repo: resolvedPr.repoFullName,
            pr: resolvedPr.prNumber,
            agent: agent.name,
            elapsedMs: outcome.elapsedMs,
          });
          return { content: [{ type: 'text', text: JSON.stringify(view) }] };
        }
        if (outcome.kind === 'failed' || outcome.kind === 'cancelled') {
          throw runOutcomeError(outcome.run);
        }

        const reviews = await deps.api.listReviews(resolvedPr.prId);
        const review = reviews.find((r) => r.run_id === runId) ?? null;
        const view = formatReviewResult({
          repo: resolvedPr.repoFullName,
          pr: resolvedPr.prNumber,
          run: outcome.run,
          review,
          severity: args.severity,
          limit: args.limit,
          attached,
        });
        return { content: [{ type: 'text', text: JSON.stringify(view) }] };
      } catch (e) {
        return toErrorResult(e, deps.config.apiBase);
      }
    },
  );
}
