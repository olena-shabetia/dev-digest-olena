import { eq, and } from 'drizzle-orm';
import type { Container } from '../../platform/container.js';
import * as t from '../../db/schema.js';
import { DEFAULT_BRANCH } from '../repos/constants.js';
import { AlertChannelRepository } from './repository.js';

export class AlertService {
  private readonly repo: AlertChannelRepository;

  constructor(private readonly container: Container) {
    this.repo = new AlertChannelRepository(container.db);
  }

  async listChannels(workspaceId: string) {
    return this.repo.findAll(workspaceId);
  }

  async createChannel(workspaceId: string, data: {
    name: string;
    webhookUrl: string;
    signingSecret: string;
  }) {
    const existing = await this.container.db
      .select()
      .from(t.alertChannels)
      .where(and(
        eq(t.alertChannels.workspaceId, workspaceId),
        eq(t.alertChannels.webhookUrl, data.webhookUrl),
      ));

    if (existing.length > 0) {
      throw new Error('A channel with this webhook URL already exists');
    }

    return this.repo.insert({ ...data, workspaceId, enabled: true });
  }

  async getDefaultBranch(): Promise<string> {
    return DEFAULT_BRANCH;
  }
}
