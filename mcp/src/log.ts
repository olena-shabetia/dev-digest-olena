// stdout is the JSON-RPC transport for this stdio MCP server — nothing may
// ever write there. This is the ONLY logging surface in the package
// (enforced by `no-console: error` in eslint.config.mjs); every other module
// imports `log` instead of touching `process.stderr`/`console` directly.
interface LogFields {
  [key: string]: unknown;
}

function write(level: 'info' | 'warn' | 'error', msg: string, data?: unknown): void {
  const entry: LogFields = { level, msg, ts: new Date().toISOString() };
  if (data !== undefined) entry.data = data;
  process.stderr.write(JSON.stringify(entry) + '\n');
}

export const log = {
  info(msg: string, data?: unknown): void {
    write('info', msg, data);
  },
  warn(msg: string, data?: unknown): void {
    write('warn', msg, data);
  },
  error(msg: string, data?: unknown): void {
    write('error', msg, data);
  },
};
