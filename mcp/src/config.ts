// Single env-read point for the MCP server (mirrors server/AGENTS.md's "one
// read point" rule for secrets, applied here to plain config — MCP has no
// secrets to protect, but scattering `process.env` reads makes tests and
// defaults drift). Every other module receives config as a value, never
// reads `process.env` itself.
import { z } from 'zod';
import { log } from './log.js';

const EnvSchema = z.object({
  DEVDIGEST_API_BASE: z.string().url().default('http://localhost:3001'),
  DEVDIGEST_MCP_RUN_TIMEOUT_MS: z.coerce.number().int().positive().default(180_000),
  DEVDIGEST_MCP_POLL_MS: z.coerce.number().int().positive().default(4_000),
  DEVDIGEST_MCP_HTTP_TIMEOUT_MS: z.coerce.number().int().positive().default(15_000),
});

export interface McpConfig {
  apiBase: string;
  runTimeoutMs: number;
  pollIntervalMs: number;
  httpTimeoutMs: number;
}

function isLoopbackHost(hostname: string): boolean {
  return hostname === 'localhost' || hostname === '127.0.0.1' || hostname === '::1';
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): McpConfig {
  const parsed = EnvSchema.parse({
    DEVDIGEST_API_BASE: env.DEVDIGEST_API_BASE,
    DEVDIGEST_MCP_RUN_TIMEOUT_MS: env.DEVDIGEST_MCP_RUN_TIMEOUT_MS,
    DEVDIGEST_MCP_POLL_MS: env.DEVDIGEST_MCP_POLL_MS,
    DEVDIGEST_MCP_HTTP_TIMEOUT_MS: env.DEVDIGEST_MCP_HTTP_TIMEOUT_MS,
  });

  const apiBase = parsed.DEVDIGEST_API_BASE.replace(/\/$/, '');
  const hostname = new URL(apiBase).hostname;
  if (!isLoopbackHost(hostname)) {
    log.warn(
      'DEVDIGEST_API_BASE is not a loopback host; this MCP server is designed for local use only',
      {
        apiBase,
      },
    );
  }

  return {
    apiBase,
    runTimeoutMs: parsed.DEVDIGEST_MCP_RUN_TIMEOUT_MS,
    pollIntervalMs: parsed.DEVDIGEST_MCP_POLL_MS,
    httpTimeoutMs: parsed.DEVDIGEST_MCP_HTTP_TIMEOUT_MS,
  };
}
