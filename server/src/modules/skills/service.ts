import type { Container } from '../../platform/container.js';
import type { Skill, SkillImportPreview, SkillStats, SkillVersion } from '@devdigest/shared';
import { SkillsRepository } from './repository.js';
import { toSkillDto, parseSkillMarkdown, parseSkillArchive } from './helpers.js';
import { ValidationError } from '../../platform/errors.js';

/**
 * L02 — skills service. Business logic for the Skills page + the Skills tab in
 * the Agent editor. A Skill = name + description + type + source + body +
 * enabled + version. Body changes are versioned via `skill_versions`
 * (repository). Never executes a skill body or an imported archive's contents
 * — the only thing done with a skill is concatenate its body into a prompt.
 */

export interface CreateSkillInput {
  name: string;
  description: string;
  type: string;
  source: string;
  body: string;
  enabled?: boolean;
  evidence_files?: string[];
}

export interface UpdateSkillInput {
  name?: string;
  description?: string;
  type?: string;
  source?: string;
  body?: string;
  enabled?: boolean;
  evidence_files?: string[];
  change_note?: string | null;
}

export class SkillsService {
  private repo: SkillsRepository;

  constructor(private container: Container) {
    this.repo = new SkillsRepository(container.db);
  }

  async list(workspaceId: string): Promise<Skill[]> {
    const rows = await this.repo.list(workspaceId);
    return rows.map(toSkillDto);
  }

  async get(workspaceId: string, id: string): Promise<Skill | undefined> {
    const row = await this.repo.getById(workspaceId, id);
    return row ? toSkillDto(row) : undefined;
  }

  /** Delete a skill (and its versions/agent-links, via cascade). */
  async delete(workspaceId: string, id: string): Promise<boolean> {
    return this.repo.deleteById(workspaceId, id);
  }

  async create(workspaceId: string, input: CreateSkillInput): Promise<Skill> {
    const row = await this.repo.insert({
      workspaceId,
      name: input.name,
      description: input.description,
      type: input.type,
      source: input.source,
      body: input.body,
      enabled: input.enabled,
      ...(input.evidence_files !== undefined ? { evidenceFiles: input.evidence_files } : {}),
    });
    return toSkillDto(row);
  }

  async update(
    workspaceId: string,
    id: string,
    patch: UpdateSkillInput,
  ): Promise<Skill | undefined> {
    const row = await this.repo.update(
      workspaceId,
      id,
      {
        ...(patch.name !== undefined ? { name: patch.name } : {}),
        ...(patch.description !== undefined ? { description: patch.description } : {}),
        ...(patch.type !== undefined ? { type: patch.type } : {}),
        ...(patch.source !== undefined ? { source: patch.source } : {}),
        ...(patch.body !== undefined ? { body: patch.body } : {}),
        ...(patch.enabled !== undefined ? { enabled: patch.enabled } : {}),
        ...(patch.evidence_files !== undefined ? { evidenceFiles: patch.evidence_files } : {}),
      },
      patch.change_note,
    );
    return row ? toSkillDto(row) : undefined;
  }

  /**
   * Body-snapshot history for a skill, newest version first. Workspace-scoped:
   * returns undefined when the skill isn't in this workspace (the route maps
   * that to 404) so snapshots can't be read across tenants.
   */
  async listVersions(workspaceId: string, skillId: string): Promise<SkillVersion[] | undefined> {
    const skill = await this.repo.getById(workspaceId, skillId);
    if (!skill) return undefined;
    const rows = await this.repo.listVersions(skillId);
    return rows.map((row) => ({
      skill_id: row.skillId,
      version: row.version,
      body: row.body,
      change_note: row.changeNote,
      created_at: row.createdAt.toISOString(),
    }));
  }

  /**
   * Which agents currently use this skill. Workspace-scoped the same way as
   * `listVersions`. Deliberately small — no per-run attribution exists (see
   * specs/L02-skills.md), so this is the only real data available.
   */
  async stats(workspaceId: string, skillId: string): Promise<SkillStats | undefined> {
    const skill = await this.repo.getById(workspaceId, skillId);
    if (!skill) return undefined;
    const agentsUsing = await this.repo.agentsUsingSkill(skillId);
    return { skill_id: skillId, agents_using: agentsUsing };
  }

  /**
   * Parse an uploaded file into a preview — nothing is written to the DB. The
   * client confirms via a normal `POST /skills` with `source: 'imported_url'`
   * and `enabled: false`.
   */
  importPreview(filename: string, buffer: Buffer): SkillImportPreview {
    const lower = filename.toLowerCase();
    if (lower.endsWith('.md') || lower.endsWith('.markdown')) {
      return parseSkillMarkdown(filename, buffer.toString('utf8'));
    }
    if (lower.endsWith('.zip')) {
      return parseSkillArchive(filename, buffer);
    }
    throw new ValidationError('Unsupported file type — expected .md, .markdown, or .zip');
  }
}
