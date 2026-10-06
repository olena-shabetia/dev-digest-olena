import { Octokit } from 'octokit';
import type { GitHubClient, PullRequestInfo } from '../../vendor/shared/adapters.js';

export class OctokitGitHubClient implements GitHubClient {
  private readonly octokit: Octokit;

  constructor(token: string) {
    this.octokit = new Octokit({ auth: token });
  }

  async getPullRequest(repo: string, number: number): Promise<PullRequestInfo> {
    const [owner, name] = repo.split('/');
    const { data } = await this.octokit.rest.pulls.get({ owner, repo: name, pull_number: number });
    return { title: data.title, body: data.body ?? '', headSha: data.head.sha };
  }

  async listChangedFiles(repo: string, number: number): Promise<string[]> {
    const [owner, name] = repo.split('/');
    const files = await this.octokit.paginate(this.octokit.rest.pulls.listFiles, {
      owner,
      repo: name,
      pull_number: number,
    });
    return files.map((f) => f.filename);
  }
}
