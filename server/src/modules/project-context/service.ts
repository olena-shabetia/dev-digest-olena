import type { Container } from '../../platform/container.js';
import type { ProjectContextListing, SpecFile } from '@devdigest/shared';
import { NotFoundError, ValidationError } from '../../platform/errors.js';
import {
  ProjectDocPathError,
  isSafeDocPath,
  listRepoDocs,
  readWorkingTreeDoc,
} from '../../platform/project-context/index.js';
import { toSpecFileDto, usedByFor } from './helpers.js';

/**
 * L05 — project-context listing + preview business logic. Zero SQL of its
 * own (server/AGENTS.md): the repo lookup goes through
 * `container.reviewRepo.getRepo` plus an explicit `workspaceId` equality
 * check — the same pattern `reviews/service.ts` and `pr-history/service.ts`
 * already use for an unscoped-by-id repository method — and the usage count
 * goes through `container.agentsRepo.countAgentsUsingDocs`. There is no
 * `repository.ts` here (D3): this module owns no table of its own.
 *
 * No `container.projectContext` getter (D3, the `blast`/`pr-history`
 * pattern): nothing outside `project-context/` consumes this service, so it
 * is constructed inline in `routes.ts` instead of registered on `Container`
 * (avoids a `no-circular` hit, server/INSIGHTS.md 2026-09-22).
 */
export class ProjectContextService {
  constructor(private container: Container) {}

  private async resolveRepo(workspaceId: string, repoId: string) {
    const repo = await this.container.reviewRepo.getRepo(repoId);
    if (!repo || repo.workspaceId !== workspaceId) throw new NotFoundError('Repo not found');
    return repo;
  }

  async list(workspaceId: string, repoId: string): Promise<ProjectContextListing> {
    const repo = await this.resolveRepo(workspaceId, repoId);
    const globs = this.container.config.projectContextGlobs;
    const { status, docs } = await listRepoDocs(
      { owner: repo.owner, name: repo.name, clonePath: repo.clonePath },
      globs,
    );

    const usage =
      status === 'ok' && docs.length > 0
        ? await this.container.agentsRepo.countAgentsUsingDocs(workspaceId, repoId)
        : new Map<string, number>();

    return {
      status,
      roots: globs,
      docs: docs.map((d) => toSpecFileDto(d, usedByFor(usage, d.path))),
    };
  }

  /**
   * Full-content preview of one doc. Validation runs BEFORE the repo lookup
   * wherever it can be checked without I/O (`isSafeDocPath` is pure), so an
   * unsafe path never reaches the database.
   */
  async file(workspaceId: string, repoId: string, path: string): Promise<SpecFile> {
    if (!isSafeDocPath(path)) throw new ValidationError('Unsafe document path');

    const repo = await this.resolveRepo(workspaceId, repoId);
    const globs = this.container.config.projectContextGlobs;
    const { status, docs } = await listRepoDocs(
      { owner: repo.owner, name: repo.name, clonePath: repo.clonePath },
      globs,
    );
    if (status !== 'ok') throw new ValidationError('Repo has no clone on disk');

    const doc = docs.find((d) => d.path === path);
    if (!doc) throw new ValidationError('Document is not in the current discovered set');

    let content: string;
    try {
      content = await readWorkingTreeDoc(repo.clonePath as string, path);
    } catch (err) {
      if (err instanceof ProjectDocPathError) throw new ValidationError(err.message);
      throw err;
    }

    const usage = await this.container.agentsRepo.countAgentsUsingDocs(workspaceId, repoId);
    return toSpecFileDto(doc, usedByFor(usage, path), content);
  }
}
