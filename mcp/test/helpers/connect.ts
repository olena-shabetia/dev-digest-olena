// Links a real MCP `Client` to `createServer(deps)` over `InMemoryTransport`
// so tools.test.ts and tools-list-budget.test.ts exercise the actual
// JSON-RPC protocol (schema validation, annotations, content shape) rather
// than calling handlers directly.
import { Client } from '@modelcontextprotocol/sdk/client/index.js';
import { InMemoryTransport } from '@modelcontextprotocol/sdk/inMemory.js';
import { createServer, type ToolDeps } from '../../src/server.js';

export async function connectClient(deps: ToolDeps): Promise<Client> {
  const [clientTransport, serverTransport] = InMemoryTransport.createLinkedPair();
  const server = createServer(deps);
  const client = new Client({ name: 'test-client', version: '0.0.0' });

  await Promise.all([server.connect(serverTransport), client.connect(clientTransport)]);

  return client;
}
