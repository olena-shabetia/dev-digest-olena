import {
  pgTable,
  uuid,
  text,
  integer,
  bigint,
  timestamp,
  doublePrecision,
  uniqueIndex,
  index,
} from 'drizzle-orm/pg-core';
import { agents } from './agents';
import { workspaces } from './core';
import { agentRuns } from './runs';

export const ciInstallations = pgTable(
  'ci_installations',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    agentId: uuid('agent_id')
      .notNull()
      .references(() => agents.id, { onDelete: 'cascade' }),
    agentSlug: text('agent_slug').notNull(),
    repo: text('repo').notNull(),
    githubRepoId: bigint('github_repo_id', { mode: 'number' }).notNull(),
    targetType: text('target_type', { enum: ['gha', 'circle', 'jenkins', 'cli'] }).notNull(),
    prUrl: text('pr_url').notNull(),
    agentVersion: integer('agent_version').notNull(),
    installedAt: timestamp('installed_at', { withTimezone: true }).defaultNow().notNull(),
    updatedAt: timestamp('updated_at', { withTimezone: true }).defaultNow().notNull(),
  },
  (t) => ({
    wsRepoUq: uniqueIndex('ci_installations_ws_repo_uq').on(t.workspaceId, t.repo),
    wsAgentIdx: index('ci_installations_ws_agent_idx').on(t.workspaceId, t.agentId),
  }),
);

export const ciRuns = pgTable(
  'ci_runs',
  {
    id: uuid('id').primaryKey().defaultRandom(),
    workspaceId: uuid('workspace_id')
      .notNull()
      .references(() => workspaces.id, { onDelete: 'cascade' }),
    ciInstallationId: uuid('ci_installation_id').references(() => ciInstallations.id, {
      onDelete: 'set null',
    }),
    agentRunId: uuid('agent_run_id').references(() => agentRuns.id, { onDelete: 'set null' }),
    repo: text('repo').notNull(),
    workflowRunId: bigint('workflow_run_id', { mode: 'number' }).notNull(),
    runAttempt: integer('run_attempt').notNull(),
    headSha: text('head_sha').notNull(),
    conclusion: text('conclusion'),
    verdict: text('verdict'),
    error: text('error'),
    schemaVersion: integer('schema_version'),
    agentVersion: integer('agent_version'),
    runnerVersion: text('runner_version'),
    prNumber: integer('pr_number'),
    ranAt: timestamp('ran_at', { withTimezone: true }),
    status: text('status'),
    findingsCount: integer('findings_count'),
    costUsd: doublePrecision('cost_usd'),
    githubUrl: text('github_url'),
    source: text('source'),
  },
  (t) => ({
    wsRunAttemptUq: uniqueIndex('ci_runs_ws_run_attempt_uq').on(
      t.workspaceId,
      t.workflowRunId,
      t.runAttempt,
    ),
    wsRanAtIdx: index('ci_runs_ws_ran_at_idx').on(t.workspaceId, t.ranAt),
  }),
);
