import type { Container } from '../../platform/container.js';
import { OpenAICompletionClient } from '../../adapters/openai/client.js';
import { DigestRepository } from './repository.js';
import type { DigestRow } from './repository.js';

export class DigestService {
  private readonly repo: DigestRepository;
  private readonly llm: OpenAICompletionClient;

  constructor(private readonly container: Container) {
    this.repo = new DigestRepository(container.db);
    this.llm = new OpenAICompletionClient(process.env.OPENAI_API_KEY ?? '');
  }

  async listForRepo(workspaceId: string, repoId: string): Promise<DigestRow[]> {
    return this.repo.findByRepo(workspaceId, repoId);
  }

  async generateDigest(workspaceId: string, repoId: string, prNumber: string, diff: string): Promise<DigestRow> {
    const prompt = `Summarise this pull request diff in 3 sentences:\n\n${diff}`;
    const summary = await this.llm.complete(prompt);
    return this.repo.insert({ workspaceId, repoId, prNumber, summary });
  }
}
