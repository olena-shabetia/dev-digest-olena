// A hand-rolled `fetch` fake for DevDigestApi tests. Deliberately not MSW
// (server/INSIGHTS.md, root INSIGHTS.md — mcp/ never installs anything beyond
// what WU-1 already declared): DevDigestApi takes `fetchImpl` as a
// constructor option precisely so a plain function is enough here.
export interface FakeRequest {
  method: string;
  path: string;
  body: unknown;
}

export type RouteHandler = (req: FakeRequest) => Response | Promise<Response>;

/** Route keys are `"METHOD /pattern"`, where a `:segment` in the pattern
 *  matches any single path segment — e.g. `"GET /repos/:id/pulls"`. */
export type RouteTable = Record<string, RouteHandler>;

function matchPattern(pattern: string, path: string): boolean {
  const patternParts = pattern.split('/').filter(Boolean);
  const pathParts = path.split('/').filter(Boolean);
  if (patternParts.length !== pathParts.length) return false;
  return patternParts.every((part, i) => part.startsWith(':') || part === pathParts[i]);
}

export function createFakeFetch(routes: RouteTable): {
  fetchImpl: typeof fetch;
  calls: FakeRequest[];
  callCount: (routeKey: string) => number;
} {
  const calls: FakeRequest[] = [];

  const fetchImpl = (async (input: Parameters<typeof fetch>[0], init?: RequestInit) => {
    const url = typeof input === 'string' ? input : input.toString();
    const method = (init?.method ?? 'GET').toUpperCase();
    const path = url.replace(/^https?:\/\/[^/]+/, '');
    const body = init?.body != null ? JSON.parse(init.body as string) : undefined;

    if (init?.signal?.aborted) {
      throw new DOMException('The operation was aborted', 'AbortError');
    }

    const request: FakeRequest = { method, path, body };
    calls.push(request);

    const routeKey = Object.keys(routes).find((key) => {
      const [routeMethod, ...rest] = key.split(' ');
      const pattern = rest.join(' ');
      return routeMethod === method && matchPattern(pattern, path);
    });

    if (!routeKey) {
      throw new Error(`fake-fetch: no route registered for ${method} ${path}`);
    }

    const handler = routes[routeKey];
    if (!handler) {
      throw new Error(`fake-fetch: no route registered for ${method} ${path}`);
    }
    return handler(request);
  }) as typeof fetch;

  return {
    fetchImpl,
    calls,
    callCount: (routeKey: string) =>
      calls.filter((c) => `${c.method} ${c.path}` === routeKey).length,
  };
}

export function jsonResponse(body: unknown, init?: { status?: number }): Response {
  return new Response(JSON.stringify(body), {
    status: init?.status ?? 200,
    headers: { 'content-type': 'application/json' },
  });
}
