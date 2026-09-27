// Entrypoint, imported by bin/devdigest-mcp.mjs under tsx. Wires config -> API
// client -> resolver -> run registry -> server, then connects over stdio.
// Deliberately does NOT call `api.ping()` on startup (plan §5 WU-7 step 4):
// the server must come up even when the DevDigest API is down, so the first
// tool call surfaces `api_unreachable` instead of the process refusing to start.
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { loadConfig } from './config.js';
import { DevDigestApi } from './api/client.js';
import { Resolver } from './resolve.js';
import { RunRegistry } from './runs.js';
import { createServer } from './server.js';
import { log } from './log.js';

const config = loadConfig();
const api = new DevDigestApi({ baseUrl: config.apiBase, timeoutMs: config.httpTimeoutMs });
const resolver = new Resolver(api);
const runs = new RunRegistry();
const server = createServer({ api, resolver, runs, config });

process.on('unhandledRejection', (reason) => {
  log.error('unhandledRejection', {
    reason: reason instanceof Error ? reason.message : String(reason),
  });
});
process.on('uncaughtException', (err) => {
  log.error('uncaughtException', { message: err instanceof Error ? err.message : String(err) });
});

await server.connect(new StdioServerTransport());
