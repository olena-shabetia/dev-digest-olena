/**
 * PR Brief persistence. One row per PR (`pr_brief`), workspace-scoped.
 * Single-statement reads/upserts only; no business logic.
 */
import { and, eq } from 'drizzle-orm';
import { FeatureModelChoice, type PrBriefRecord } from '@devdigest/shared';
import type { Db } from '../../db/client.js';
import * as t from '../../db/schema.js';

export class BriefRepository {
  constructor(private db: Db) {}

  /** Raw stored JSON (validated by the caller), or `undefined` when absent. */
  async getBrief(workspaceId: string, prId: string): Promise<unknown | undefined> {
    const [row] = await this.db
      .select({ json: t.prBrief.json })
      .from(t.prBrief)
      .where(and(eq(t.prBrief.prId, prId), eq(t.prBrief.workspaceId, workspaceId)));
    return row?.json;
  }

  async upsertBrief(workspaceId: string, prId: string, record: PrBriefRecord): Promise<void> {
    await this.db
      .insert(t.prBrief)
      .values({ prId, workspaceId, json: record })
      .onConflictDoUpdate({ target: t.prBrief.prId, set: { json: record, workspaceId } });
  }

  /** Settings → Feature Models override for `'risk_brief'`, or `undefined`. */
  async getBriefModelOverride(workspaceId: string): Promise<FeatureModelChoice | undefined> {
    const rows = await this.db
      .select({ key: t.settings.key, value: t.settings.value })
      .from(t.settings)
      .where(eq(t.settings.workspaceId, workspaceId));
    const settingsMap: Record<string, unknown> = {};
    for (const r of rows) settingsMap[r.key] = r.value;
    const fm = (settingsMap as { feature_models?: Record<string, unknown> }).feature_models;
    const parsed = FeatureModelChoice.safeParse(fm?.risk_brief);
    return parsed.success ? parsed.data : undefined;
  }
}
