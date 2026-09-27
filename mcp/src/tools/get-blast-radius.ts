// `get_blast_radius` — homework stub (plan §2 "поза скоупом"). Always returns
// `{status:"not_implemented"}`, never `isError`, and makes zero API calls —
// so calling it can never fail or spend anything.
import { z } from 'zod';
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { ToolDeps } from '../server.js';

export function registerGetBlastRadius(server: McpServer, _deps: ToolDeps): void {
  server.registerTool(
    'get_blast_radius',
    {
      title: 'Get blast radius',
      description:
        'NOT IMPLEMENTED YET: always returns status "not_implemented"; do not retry. Will return the symbols a PR changes and their downstream callers. Use get_findings meanwhile.',
      inputSchema: {
        repo: z.string().describe('GitHub repo as "owner/name"'),
        pr: z.coerce.number().int().positive().describe('Pull request number'),
      },
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async (args) => {
      const view = {
        status: 'not_implemented' as const,
        tool: 'get_blast_radius' as const,
        repo: args.repo,
        pr: args.pr,
        hint: 'Blast radius is not available yet; do not retry. Use get_findings or get_conventions.',
      };
      return { content: [{ type: 'text' as const, text: JSON.stringify(view) }] };
    },
  );
}
