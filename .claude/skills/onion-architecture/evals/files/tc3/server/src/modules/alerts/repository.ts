import { eq, and } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

export class AlertChannelRepository {
  constructor(private readonly db: Db) {}

  async findAll(workspaceId: string) {
    return this.db
      .select()
      .from(t.alertChannels)
      .where(eq(t.alertChannels.workspaceId, workspaceId));
  }

  async findById(workspaceId: string, id: string) {
    const rows = await this.db
      .select()
      .from(t.alertChannels)
      .where(and(eq(t.alertChannels.workspaceId, workspaceId), eq(t.alertChannels.id, id)));
    return rows[0] ?? null;
  }

  async insert(data: Omit<typeof t.alertChannels.$inferInsert, 'id' | 'createdAt'>) {
    const [row] = await this.db.insert(t.alertChannels).values(data).returning();
    return row;
  }
}
