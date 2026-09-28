#!/usr/bin/env node
// Entrypoint for the devdigest MCP stdio server. Launched directly with
// `node bin/devdigest-mcp.mjs` — never via `npm run`, since npm prints a
// banner to stdout and stdout is the JSON-RPC channel here.
import { fileURLToPath } from 'node:url';
import { register } from 'tsx/esm/api';

register({ tsconfig: fileURLToPath(new URL('../tsconfig.json', import.meta.url)) });

await import('../src/index.ts');
