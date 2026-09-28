// Composition root for the MCP tool layer. `createServer` wires the 5 frozen
// tools (plan §3.4) onto a fresh `McpServer` given the shared dependencies —
// no tool file talks to `McpServer` construction directly.
import { McpServer } from '@modelcontextprotocol/sdk/server/mcp.js';
import type { DevDigestApi } from './api/client.js';
import type { Resolver } from './resolve.js';
import type { RunRegistry } from './runs.js';
import type { McpConfig } from './config.js';
import { registerListAgents } from './tools/list-agents.js';
import { registerRunAgentOnPr } from './tools/run-agent-on-pr.js';
import { registerGetFindings } from './tools/get-findings.js';
import { registerGetConventions } from './tools/get-conventions.js';
import { registerGetBlastRadius } from './tools/get-blast-radius.js';

export interface ToolDeps {
  api: DevDigestApi;
  resolver: Resolver;
  runs: RunRegistry;
  config: McpConfig;
}

export function createServer(deps: ToolDeps): McpServer {
  const server = new McpServer(
    { name: 'devdigest', version: '0.1.0' },
    {
      instructions:
        'DevDigest local PR reviewer: call list_agents first; run_agent_on_pr spends LLM money.',
    },
  );

  registerListAgents(server, deps);
  registerRunAgentOnPr(server, deps);
  registerGetFindings(server, deps);
  registerGetConventions(server, deps);
  registerGetBlastRadius(server, deps);

  return server;
}
