export interface PullRequestInfo {
  title: string;
  body: string;
  headSha: string;
}

export interface GitHubClient {
  getPullRequest(repo: string, number: number): Promise<PullRequestInfo>;
  listChangedFiles(repo: string, number: number): Promise<string[]>;
}

export interface SecretsProvider {
  get(key: string): Promise<string | undefined>;
}

export interface AuthProvider {
  currentWorkspace(): Promise<{ id: string; name: string }>;
  currentUser(): Promise<{ id: string; email: string }>;
}

export interface LLMProvider {
  complete(input: { model: string; prompt: string }): Promise<{ text: string; costUsd: number }>;
}
