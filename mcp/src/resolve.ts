// Turns the flat, model-supplied arguments (`repo`, `pr`, `agent`) into the
// ids the DevDigest API actually needs. Every miss becomes a `ToolError`
// whose message already carries the frozen, actionable text from the plan's
// §3.5 error table — callers never re-word these.
import type { Agent, PrMeta, Repo } from '@devdigest/shared';
import type { DevDigestApi } from './api/client.js';
import { ToolError } from './errors.js';

export interface ResolvedPr {
  repoId: string;
  repoFullName: string;
  prId: string;
  prNumber: number;
}

const DEFAULT_TTL_MS = 60_000;
const KNOWN_REPOS_LIMIT = 5;

/** Strips a `https://github.com/` prefix and a trailing `.git`, trims, and
 *  lowercases — so "https://github.com/Acme/Payments-API.git" and
 *  "acme/payments-api" compare equal. */
export function normalizeRepoArg(repo: string): string {
  return repo
    .trim()
    .replace(/^https?:\/\/github\.com\//i, '')
    .replace(/\.git$/i, '')
    .replace(/\/+$/, '')
    .toLowerCase();
}

interface CacheEntry<T> {
  value: T;
  expiresAt: number;
}

export class Resolver {
  private readonly api: DevDigestApi;
  private readonly ttlMs: number;
  private readonly now: () => number;
  private reposCache: CacheEntry<Repo[]> | null = null;
  private agentsCache: CacheEntry<Agent[]> | null = null;
  private readonly pullsCache = new Map<string, CacheEntry<PrMeta[]>>();

  constructor(api: DevDigestApi, opts?: { ttlMs?: number; now?: () => number }) {
    this.api = api;
    this.ttlMs = opts?.ttlMs ?? DEFAULT_TTL_MS;
    this.now = opts?.now ?? Date.now;
  }

  private async getRepos(): Promise<Repo[]> {
    if (this.reposCache && this.reposCache.expiresAt > this.now()) {
      return this.reposCache.value;
    }
    const repos = await this.api.listRepos();
    this.reposCache = { value: repos, expiresAt: this.now() + this.ttlMs };
    return repos;
  }

  private async getAgents(): Promise<Agent[]> {
    if (this.agentsCache && this.agentsCache.expiresAt > this.now()) {
      return this.agentsCache.value;
    }
    const agents = await this.api.listAgents();
    this.agentsCache = { value: agents, expiresAt: this.now() + this.ttlMs };
    return agents;
  }

  private async getPulls(repoId: string, opts?: { forceRefetch?: boolean }): Promise<PrMeta[]> {
    const cached = this.pullsCache.get(repoId);
    if (!opts?.forceRefetch && cached && cached.expiresAt > this.now()) {
      return cached.value;
    }
    const pulls = await this.api.listPulls(repoId);
    this.pullsCache.set(repoId, { value: pulls, expiresAt: this.now() + this.ttlMs });
    return pulls;
  }

  async resolveRepo(repo: string): Promise<{ id: string; fullName: string }> {
    const target = normalizeRepoArg(repo);
    const repos = await this.getRepos();
    const match = repos.find((r) => normalizeRepoArg(r.full_name) === target);
    if (!match) {
      const known = repos.slice(0, KNOWN_REPOS_LIMIT).map((r) => r.full_name);
      const list = known.length > 0 ? known.join(', ') : 'none';
      throw new ToolError(
        `Repo '${repo}' is not added in DevDigest. Add it in the DevDigest UI (Repositories → Add). Known repos: ${list}.`,
        'repo_not_found',
      );
    }
    return { id: match.id, fullName: match.full_name };
  }

  async resolvePull(repo: string, pr: number): Promise<ResolvedPr> {
    const { id: repoId, fullName } = await this.resolveRepo(repo);

    let pulls = await this.getPulls(repoId);
    let match = pulls.find((p) => p.id != null && p.number === pr);
    if (!match) {
      // Cache miss: refetch once (the PR may have just been imported) before
      // giving up — never more than one extra request per resolvePull call.
      pulls = await this.getPulls(repoId, { forceRefetch: true });
      match = pulls.find((p) => p.id != null && p.number === pr);
    }
    if (!match || match.id == null) {
      throw new ToolError(
        `PR #${pr} not found in DevDigest for ${repo}. Import PRs in the DevDigest UI (open the repo's PR list; needs a GitHub token in Settings).`,
        'pr_not_imported',
      );
    }
    return { repoId, repoFullName: fullName, prId: match.id, prNumber: match.number };
  }

  async resolveAgent(agent: string): Promise<Agent> {
    const agents = await this.getAgents();

    const byId = agents.find((a) => a.id === agent);
    if (byId) return byId;

    const lower = agent.toLowerCase();
    const byName = agents.find((a) => a.name.toLowerCase() === lower);
    if (byName) return byName;

    const substringMatches = agents.filter((a) => a.name.toLowerCase().includes(lower));
    if (substringMatches.length > 1) {
      const names = substringMatches.map((a) => a.name).join(', ');
      throw new ToolError(
        `Agent '${agent}' matches several agents: ${names}. Pass the exact name or id.`,
        'agent_ambiguous',
      );
    }
    const [onlyMatch] = substringMatches;
    if (substringMatches.length === 1 && onlyMatch) return onlyMatch;

    throw new ToolError(
      `Agent '${agent}' not found. Call list_agents for valid names or ids.`,
      'agent_not_found',
    );
  }
}
