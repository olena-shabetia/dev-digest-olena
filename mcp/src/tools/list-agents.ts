// `list_agents` — read-only, no arguments. First tool a model should call
// (see the server's `instructions` in ../server.ts) to get a valid `agent`
// value for run_agent_on_pr / get_findings.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import { formatAgents } from '../format.js';
import { toErrorResult } from '../errors.js';
import type { ToolDeps } from '../server.js';

export function registerListAgents(server: McpServer, deps: ToolDeps): void {
  server.registerTool(
    'list_agents',
    {
      title: 'List agents',
      description:
        'List the reviewer agents configured in DevDigest (id, name, model, enabled). Call this first to get a valid agent value for run_agent_on_pr or get_findings.',
      inputSchema: {},
      annotations: { readOnlyHint: true, idempotentHint: true, openWorldHint: false },
    },
    async () => {
      try {
        const agents = await deps.api.listAgents();
        const view = formatAgents(agents);
        return { content: [{ type: 'text', text: JSON.stringify(view) }] };
      } catch (e) {
        return toErrorResult(e, deps.config.apiBase);
      }
    },
  );
}
