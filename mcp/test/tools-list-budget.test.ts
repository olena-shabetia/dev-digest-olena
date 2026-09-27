// Enforces plan §2 D11/§3.4's token-budget invariants on `tools/list`: exactly
// 5 tools, flat-primitive-only input schemas, no `outputSchema`, and the two
// frozen size caps (6,000 chars total / 450 chars per description).
import { describe, it, expect } from 'vitest';
import { DevDigestApi } from '../src/api/client.js';
import { Resolver } from '../src/resolve.js';
import { RunRegistry } from '../src/runs.js';
import type { McpConfig } from '../src/config.js';
import type { ToolDeps } from '../src/server.js';
import { TOOLS_LIST_CHAR_BUDGET, TOOL_DESCRIPTION_MAX_CHARS } from '../src/constants.js';
import { connectClient } from './helpers/connect.js';

const EXPECTED_TOOL_NAMES = [
  'list_agents',
  'run_agent_on_pr',
  'get_findings',
  'get_conventions',
  'get_blast_radius',
];

const PRIMITIVE_JSON_TYPES = new Set(['string', 'number', 'integer', 'boolean']);

function makeDeps(): ToolDeps {
  const api = new DevDigestApi({
    baseUrl: 'http://localhost:3001',
    timeoutMs: 1000,
    fetchImpl: (() => {
      throw new Error('tools/list must never call the API');
    }) as unknown as typeof fetch,
  });
  const config: McpConfig = {
    apiBase: 'http://localhost:3001',
    runTimeoutMs: 180_000,
    pollIntervalMs: 4_000,
    httpTimeoutMs: 15_000,
  };
  return { api, resolver: new Resolver(api), runs: new RunRegistry(), config };
}

describe('tools/list budget', () => {
  it('stays within the frozen size and shape budget', async () => {
    const client = await connectClient(makeDeps());
    const { tools } = await client.listTools();

    expect(tools.map((t) => t.name).sort()).toEqual([...EXPECTED_TOOL_NAMES].sort());

    const serialized = JSON.stringify(tools);
    // Measured on the frozen §3.4 descriptions/annotations at time of writing:
    // 4182 chars total (budget 6000); per-tool description lengths were 156
    // (list_agents), 318 (run_agent_on_pr), 243 (get_findings), 196
    // (get_conventions), 170 (get_blast_radius) — all under the 450 cap.
    expect(serialized.length).toBeLessThanOrEqual(TOOLS_LIST_CHAR_BUDGET);

    for (const tool of tools) {
      expect(tool.description).toBeDefined();
      expect(tool.description!.length).toBeLessThanOrEqual(TOOL_DESCRIPTION_MAX_CHARS);
      expect(tool).not.toHaveProperty('outputSchema');

      const properties = tool.inputSchema.properties ?? {};
      for (const [propName, propSchema] of Object.entries(properties)) {
        const schema = propSchema as { type?: unknown; enum?: unknown };
        expect(
          PRIMITIVE_JSON_TYPES.has(schema.type as string),
          `${tool.name}.${propName} must be a primitive JSON type, got ${JSON.stringify(schema.type)}`,
        ).toBe(true);
      }
    }
  });

  it('matches the frozen name + annotation set', async () => {
    const client = await connectClient(makeDeps());
    const { tools } = await client.listTools();

    const summary = tools
      .map((t) => ({ name: t.name, annotations: t.annotations }))
      .sort((a, b) => a.name.localeCompare(b.name));

    expect(summary).toMatchInlineSnapshot(`
      [
        {
          "annotations": {
            "idempotentHint": true,
            "openWorldHint": false,
            "readOnlyHint": true,
          },
          "name": "get_blast_radius",
        },
        {
          "annotations": {
            "idempotentHint": true,
            "openWorldHint": false,
            "readOnlyHint": true,
          },
          "name": "get_conventions",
        },
        {
          "annotations": {
            "idempotentHint": true,
            "openWorldHint": false,
            "readOnlyHint": true,
          },
          "name": "get_findings",
        },
        {
          "annotations": {
            "idempotentHint": true,
            "openWorldHint": false,
            "readOnlyHint": true,
          },
          "name": "list_agents",
        },
        {
          "annotations": {
            "destructiveHint": false,
            "idempotentHint": false,
            "openWorldHint": true,
            "readOnlyHint": false,
          },
          "name": "run_agent_on_pr",
        },
      ]
    `);
  });
});
