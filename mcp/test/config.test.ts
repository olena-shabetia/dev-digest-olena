import { describe, it, expect, vi, afterEach } from 'vitest';
import { loadConfig } from '../src/config.js';
import { log } from '../src/log.js';

describe('loadConfig', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('returns the documented defaults when no env vars are set', () => {
    const config = loadConfig({});
    expect(config).toEqual({
      apiBase: 'http://localhost:3001',
      runTimeoutMs: 180_000,
      pollIntervalMs: 4_000,
      httpTimeoutMs: 15_000,
    });
  });

  it('reads every DEVDIGEST_MCP_* override and strips a trailing slash from the API base', () => {
    const config = loadConfig({
      DEVDIGEST_API_BASE: 'http://localhost:4000/',
      DEVDIGEST_MCP_RUN_TIMEOUT_MS: '60000',
      DEVDIGEST_MCP_POLL_MS: '2000',
      DEVDIGEST_MCP_HTTP_TIMEOUT_MS: '5000',
    } as NodeJS.ProcessEnv);

    expect(config).toEqual({
      apiBase: 'http://localhost:4000',
      runTimeoutMs: 60_000,
      pollIntervalMs: 2_000,
      httpTimeoutMs: 5_000,
    });
  });

  it('warns (via log, never console/stdout) when the API base is not a loopback host', () => {
    const warnSpy = vi.spyOn(log, 'warn').mockImplementation(() => {});
    loadConfig({ DEVDIGEST_API_BASE: 'http://example.com:3001' } as NodeJS.ProcessEnv);
    expect(warnSpy).toHaveBeenCalledOnce();
  });

  it('rejects a non-URL DEVDIGEST_API_BASE', () => {
    expect(() => loadConfig({ DEVDIGEST_API_BASE: 'not-a-url' } as NodeJS.ProcessEnv)).toThrow();
  });
});
