// Thin HTTP client over the existing Fastify API (:3001). No server internals
// are imported — only the shared Zod contracts (@devdigest/shared) to parse
// responses, and this package's own local ConventionsListResponse (D6).
// Every non-2xx response and every network failure is normalized into one of
// the error classes from ../errors.js so the tool layer never has to branch
// on raw fetch/Response shapes.
import { z } from 'zod';
import {
  Repo,
  PrMeta,
  Agent,
  ReviewRunResponse,
  ActiveRun,
  RunSummary,
  ReviewRecord,
  ApiErrorBody,
} from '@devdigest/shared';
import { ConventionsListResponse } from './schemas.js';
import { ApiHttpError, ApiUnreachableError, ToolError } from '../errors.js';

interface RequestOpts {
  body?: unknown;
  timeoutMs: number;
}

export class DevDigestApi {
  private readonly baseUrl: string;
  private readonly timeoutMs: number;
  private readonly fetchImpl: typeof fetch;

  constructor(opts: { baseUrl: string; timeoutMs: number; fetchImpl?: typeof fetch }) {
    this.baseUrl = opts.baseUrl.replace(/\/$/, '');
    this.timeoutMs = opts.timeoutMs;
    this.fetchImpl = opts.fetchImpl ?? fetch;
  }

  private async request<S extends z.ZodTypeAny>(
    method: string,
    path: string,
    schema: S,
    opts?: Partial<RequestOpts>,
  ): Promise<z.infer<S>> {
    const timeoutMs = opts?.timeoutMs ?? this.timeoutMs;
    const hasBody = opts?.body !== undefined;

    let res: Response;
    try {
      res = await this.fetchImpl(`${this.baseUrl}${path}`, {
        method,
        signal: AbortSignal.timeout(timeoutMs),
        headers: hasBody ? { 'content-type': 'application/json' } : {},
        ...(hasBody ? { body: JSON.stringify(opts?.body) } : {}),
      });
    } catch (e) {
      throw new ApiUnreachableError(e instanceof Error ? e.message : String(e), this.baseUrl);
    }

    if (!res.ok) {
      let code: string | undefined;
      let message = `${res.status} ${res.statusText}`;
      try {
        const body: unknown = await res.json();
        const parsed = ApiErrorBody.safeParse(body);
        if (parsed.success) {
          code = parsed.data.error.code;
          message = parsed.data.error.message;
        }
      } catch {
        /* non-JSON error body (e.g. the rate-limit plugin's own shape) */
      }
      throw new ApiHttpError(message, { status: res.status, code, path: `${method} ${path}` });
    }

    if (res.status === 204) {
      const parsedEmpty = schema.safeParse(undefined);
      if (!parsedEmpty.success) {
        throw new ToolError(
          `DevDigest API returned an unexpected response for ${method} ${path}. Is the server up to date with this checkout?`,
          'unexpected_shape',
        );
      }
      return parsedEmpty.data;
    }

    const json: unknown = await res.json();
    const parsed = schema.safeParse(json);
    if (!parsed.success) {
      throw new ToolError(
        `DevDigest API returned an unexpected response for ${method} ${path}. Is the server up to date with this checkout?`,
        'unexpected_shape',
      );
    }
    return parsed.data;
  }

  async ping(): Promise<void> {
    await this.request('GET', '/health', z.object({ status: z.string() }));
  }

  async listRepos(): Promise<Repo[]> {
    return this.request('GET', '/repos', z.array(Repo));
  }

  async listPulls(repoId: string): Promise<PrMeta[]> {
    return this.request('GET', `/repos/${repoId}/pulls`, z.array(PrMeta), {
      timeoutMs: this.timeoutMs * 2,
    });
  }

  async listAgents(): Promise<Agent[]> {
    return this.request('GET', '/agents', z.array(Agent));
  }

  async startReview(prId: string, agentId: string): Promise<ReviewRunResponse> {
    return this.request('POST', `/pulls/${prId}/review`, ReviewRunResponse, {
      body: { agentId },
    });
  }

  async activeRuns(prId: string): Promise<ActiveRun[]> {
    return this.request('GET', `/pulls/${prId}/runs/active`, z.array(ActiveRun));
  }

  async listRuns(prId: string): Promise<RunSummary[]> {
    return this.request('GET', `/pulls/${prId}/runs`, z.array(RunSummary));
  }

  async listReviews(prId: string): Promise<ReviewRecord[]> {
    return this.request('GET', `/pulls/${prId}/reviews`, z.array(ReviewRecord));
  }

  async getConventions(repoId: string): Promise<ConventionsListResponse> {
    return this.request('GET', `/repos/${repoId}/conventions`, ConventionsListResponse);
  }
}
