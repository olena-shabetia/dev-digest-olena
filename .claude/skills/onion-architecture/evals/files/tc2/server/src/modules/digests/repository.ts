import { eq } from 'drizzle-orm';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

export type DigestRow = typeof t.digests.$inferSelect;

export class DigestRepository {
  constructor(private readonly db: Db) {}

  async findByRepo(workspaceId: string, repoId: string): Promise<DigestRow[]> {
    return this.db
      .select()
      .from(t.digests)
      .where(eq(t.digests.workspaceId, workspaceId))
      .orderBy(t.digests.createdAt);
  }

  async insert(data: Omit<DigestRow, 'id' | 'createdAt'>): Promise<DigestRow> {
    const [row] = await this.db.insert(t.digests).values(data).returning();
    return row;
  }
}
