import { boolean, pgTable, text, timestamp, uuid } from 'drizzle-orm/pg-core';

export const repos = pgTable('repos', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull(),
  fullName: text('full_name').notNull(),
});

export const bookmarks = pgTable('bookmarks', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull(),
  url: text('url').notNull(),
  title: text('title').notNull(),
  tags: text('tags').array().notNull().default([]),
  createdBy: uuid('created_by').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const digests = pgTable('digests', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull(),
  repoId: uuid('repo_id').notNull(),
  prNumber: text('pr_number').notNull(),
  summary: text('summary').notNull(),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});

export const alertChannels = pgTable('alert_channels', {
  id: uuid('id').primaryKey().defaultRandom(),
  workspaceId: uuid('workspace_id').notNull(),
  name: text('name').notNull(),
  webhookUrl: text('webhook_url').notNull(),
  signingSecret: text('signing_secret').notNull(),
  enabled: boolean('enabled').notNull().default(true),
  createdAt: timestamp('created_at').notNull().defaultNow(),
});
