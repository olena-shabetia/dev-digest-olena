import type { CiAgentOverview, CiIngestError, CiRunsResponse } from '@devdigest/shared';
import type { GitHubClient } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import { NotFoundError } from '../../platform/errors.js';
import {
  CI_ARTIFACT_NAME,
  CI_RUNS_LIST_LIMIT,
  CI_WORKFLOW_FILE,
  INGEST_MAX_RUNS_PER_REPO,
} from './constants.js';
import { toCiInstallationDto, toCiRunDto, toIngestRecord } from './helpers.js';
import { CiRepository, type InstallationWithAgent } from './repository.js';

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/**
 * Pull-based ingest of GitHub Actions runs, plus the CI listings. Idempotent
 * (write-once per workflow run + attempt), so a repeated GET only writes new
 * runs. No timer, no job: it runs on open and on Refresh (crit. 20).
 */
export class CiIngestService {
  private readonly repo: CiRepository;

  constructor(private readonly container: Container) {
    this.repo = new CiRepository(container.db);
  }

  /** Ingest every installation sequentially; one repo failing never aborts the rest. */
  async ingestWorkspace(workspaceId: string): Promise<CiIngestError[]> {
    const all = await this.repo.listInstallations(workspaceId);
    if (all.length === 0) return [];

    let github: GitHubClient;
    try {
      github = await this.container.github();
    } catch (err) {
      const message = errorMessage(err);
      return all.map((i) => ({ repo: i.installation.repo, message }));
    }

    const errors: CiIngestError[] = [];
    for (const { installation } of all) {
      try {
        await this.ingestRepo(github, workspaceId, installation);
      } catch (err) {
        errors.push({ repo: installation.repo, message: errorMessage(err) });
      }
    }
    return errors;
  }

  async agentOverview(workspaceId: string, agentId: string): Promise<CiAgentOverview> {
    const agent = await this.container.agentsRepo.getById(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');

    const ingest_errors = await this.ingestWorkspace(workspaceId);
    const [installs, runs] = await Promise.all([
      this.repo.listInstallations(workspaceId, { agentId }),
      this.repo.listRuns(workspaceId, { agentId, limit: CI_RUNS_LIST_LIMIT }),
    ]);
    return {
      installations: installs.map((i) => toCiInstallationDto(i.installation, i.latest)),
      runs: runs.map(toCiRunDto),
      ingest_errors,
    };
  }

  async listAll(workspaceId: string): Promise<CiRunsResponse> {
    const ingest_errors = await this.ingestWorkspace(workspaceId);
    const runs = await this.repo.listRuns(workspaceId, { limit: CI_RUNS_LIST_LIMIT });
    return { runs: runs.map(toCiRunDto), ingest_errors };
  }

  private async ingestRepo(
    github: GitHubClient,
    workspaceId: string,
    installation: InstallationWithAgent,
  ): Promise<void> {
    const [owner, name] = installation.repo.split('/');
    if (!owner || !name) throw new Error(`Invalid repository name ${installation.repo}`);
    const ref = { owner, name };

    const runs = await github.listWorkflowRuns(ref, CI_WORKFLOW_FILE, INGEST_MAX_RUNS_PER_REPO);
    const known = await this.repo.knownRunKeys(
      workspaceId,
      runs.map((r) => r.id),
    );

    for (const run of runs) {
      if (known.has(`${run.id}:${run.run_attempt}`)) continue;
      // Cheap pre-checks so ignored runs cost no extra GitHub calls.
      if (run.repository_id !== installation.githubRepoId) continue;
      if (run.conclusion === 'skipped') continue;

      const jobs = await github.listWorkflowRunJobs(ref, run.id, run.run_attempt);
      const artifactZip = await github.downloadRunArtifact(ref, run.id, CI_ARTIFACT_NAME);
      const record = toIngestRecord({
        run,
        jobs,
        artifactZip,
        installation: {
          id: installation.id,
          agentId: installation.agentId,
          repo: installation.repo,
          githubRepoId: installation.githubRepoId,
        },
      });
      if (record) await this.repo.insertIngestedRun(workspaceId, record);
    }
  }
}
