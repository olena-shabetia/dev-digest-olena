import type { Db } from '../db/client.js';
import { OctokitGitHubClient } from '../adapters/github/octokit.js';
import { LocalSecretsProvider } from '../adapters/secrets/local.js';
import type { AuthProvider, GitHubClient, SecretsProvider } from '../vendor/shared/adapters.js';

export interface ContainerOverrides {
  db?: Db;
  auth?: AuthProvider;
  secrets?: SecretsProvider;
  github?: GitHubClient;
}

export class Container {
  private githubClient?: GitHubClient;

  constructor(private readonly overrides: ContainerOverrides & { db: Db; auth: AuthProvider }) {}

  get db(): Db {
    return this.overrides.db;
  }

  get auth(): AuthProvider {
    return this.overrides.auth;
  }

  get secrets(): SecretsProvider {
    return this.overrides.secrets ?? new LocalSecretsProvider();
  }

  async github(): Promise<GitHubClient> {
    if (this.overrides.github) return this.overrides.github;
    if (!this.githubClient) {
      const token = await this.secrets.get('GITHUB_TOKEN');
      if (!token) throw new Error('GITHUB_TOKEN is not configured');
      this.githubClient = new OctokitGitHubClient(token);
    }
    return this.githubClient;
  }
}

declare module 'fastify' {
  interface FastifyInstance {
    container: Container;
  }
}
