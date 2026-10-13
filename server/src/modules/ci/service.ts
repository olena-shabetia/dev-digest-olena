import { readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import type { CiExport, CiExportInput, CiFileError, CiPreview } from '@devdigest/shared';
import type { Container } from '../../platform/container.js';
import {
  AppError,
  ExternalServiceError,
  NotFoundError,
  ValidationError,
} from '../../platform/errors.js';
import {
  CI_BRANCH,
  CI_CONFLICT_CODE,
  CI_PR_TITLE,
  CI_WORKFLOW_PATH,
  SECRET_KEYS,
} from './constants.js';
import {
  buildCiFiles,
  buildZip,
  findSecretLeaks,
  toCiInstallationDto,
  toCiSlug,
  zipFilename,
  type BuiltCiFiles,
} from './helpers.js';
import { CiRepository, type InstallationWithAgent } from './repository.js';
import { applyConfigure, renderWorkflow, validateWorkflow } from './workflow.js';

/** Prebuilt runner (`pnpm build` in agent-runner/). Resolved from this file so
 *  it works under tsx, vitest and the `dist/` build alike. */
const RUNNER_BUNDLE_PATH = fileURLToPath(
  new URL('../../../../agent-runner/dist/index.js', import.meta.url),
);

export interface CiExportDeps {
  readRunnerBundle?: () => Promise<Buffer | null>;
}

async function defaultReadRunnerBundle(): Promise<Buffer | null> {
  try {
    return await readFile(RUNNER_BUNDLE_PATH);
  } catch {
    return null;
  }
}

function errorMessage(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

interface Prepared {
  agent: NonNullable<Awaited<ReturnType<Container['agentsRepo']['getById']>>>;
  repo: { owner: string; name: string; fullName: string; defaultBranch: string };
  existing: InstallationWithAgent | undefined;
  conflictAgentName: string | null;
  slug: string;
  built: BuiltCiFiles;
  errors: CiFileError[];
}

/** Preview + export of one agent to a repository's CI (GitHub Actions only). */
export class CiExportService {
  private readonly repo: CiRepository;
  private readonly readRunnerBundle: () => Promise<Buffer | null>;

  constructor(
    private readonly container: Container,
    deps: CiExportDeps = {},
  ) {
    this.repo = new CiRepository(container.db);
    this.readRunnerBundle = deps.readRunnerBundle ?? defaultReadRunnerBundle;
  }

  async preview(workspaceId: string, agentId: string, input: CiExportInput): Promise<CiPreview> {
    const p = await this.prepare(workspaceId, agentId, input, false);
    return {
      files: p.built.files,
      errors: p.errors,
      conflict_agent_name: p.conflictAgentName,
    };
  }

  async export(workspaceId: string, agentId: string, input: CiExportInput): Promise<CiExport> {
    // 1. one agent per repository
    const p = await this.prepare(workspaceId, agentId, input, true);
    if (p.conflictAgentName !== null) {
      throw new AppError(
        CI_CONFLICT_CODE,
        `${p.repo.fullName} already runs ${p.conflictAgentName} in CI — one agent per repository in this version.`,
        409,
      );
    }
    // 2. every check
    if (p.errors.length > 0) {
      const first = p.errors[0]!;
      throw new ValidationError(`${first.path}: ${first.message}`, { errors: p.errors });
    }

    if (input.action === 'files') {
      return {
        action: 'files',
        filename: zipFilename(p.slug),
        zip_base64: Buffer.from(buildZip(p.built.tree)).toString('base64'),
      };
    }

    // 3. never write to the default branch
    if (CI_BRANCH === p.repo.defaultBranch) {
      throw new ValidationError(`Refusing to commit to the default branch ${p.repo.defaultBranch}`);
    }

    const github = await this.container.github();
    const ref = { owner: p.repo.owner, name: p.repo.name };
    let prUrl: string;
    let githubRepoId: number;
    try {
      // 4. numeric repository id (trusted key for ingest)
      githubRepoId = await github.getRepoId(ref);
      // 5. one atomic commit, then open or reuse the PR
      await github.commitFiles(ref, {
        branch: CI_BRANCH,
        base: p.repo.defaultBranch,
        message: `Add DevDigest CI review (${p.agent.name} v${p.agent.version})`,
        files: p.built.tree.map((f) => ({
          path: f.path,
          contents: Buffer.from(f.bytes).toString('utf8'),
        })),
      });
      const open = await github.findOpenPr(ref, CI_BRANCH);
      prUrl = (
        open ??
        (await github.openPullRequest(ref, {
          title: CI_PR_TITLE,
          head: CI_BRANCH,
          base: p.repo.defaultBranch,
          body: prBody(p.built),
        }))
      ).url;
    } catch (err) {
      throw new ExternalServiceError(errorMessage(err));
    }

    // 6. only now record the installation
    const installation = await this.repo.upsertInstallation(workspaceId, {
      agentId,
      agentSlug: p.slug,
      repo: p.repo.fullName,
      githubRepoId,
      prUrl,
      agentVersion: p.agent.version,
    });
    return {
      action: 'open_pr',
      pr_url: prUrl,
      installation: toCiInstallationDto(installation, null),
    };
  }

  /** Shared by preview and export: resolve inputs, build files, run checks. */
  private async prepare(
    workspaceId: string,
    agentId: string,
    input: CiExportInput,
    forInstall: boolean,
  ): Promise<Prepared> {
    const agent = await this.container.agentsRepo.getById(workspaceId, agentId);
    if (!agent) throw new NotFoundError('Agent not found');
    const repo = await this.repo.findRepoByFullName(workspaceId, input.repo);
    if (!repo) throw new NotFoundError('Repository not found');

    const existing = await this.repo.getInstallationByRepo(workspaceId, repo.fullName);
    const sameAgent = existing?.agentId === agentId;
    const conflictAgentName =
      existing && !sameAgent ? (existing.agentName ?? 'another agent') : null;
    const slug = existing && sameAgent ? existing.agentSlug : toCiSlug(agent.name);

    // Only enabled skills, in link order (parity with reviews/run-executor.ts).
    const links = await this.container.agentsRepo.linkedSkills(agentId);
    const skills = links.filter((l) => l.skill.enabled).map((l) => l.skill);

    // Install applies the Configure choices to the text the user sees; Preview
    // shows the text as-is (generated when none was supplied).
    const generated = renderWorkflow({ triggers: input.triggers, postAs: input.post_as });
    const workflowText =
      input.workflow === undefined
        ? generated
        : forInstall
          ? applyConfigure(input.workflow, input.triggers, input.post_as)
          : input.workflow;

    const bundle = await this.readRunnerBundle();
    const built = buildCiFiles(agent, skills, workflowText, bundle, slug);

    const errors = [...built.errors];
    const problem = validateWorkflow(workflowText);
    if (problem) errors.push({ path: CI_WORKFLOW_PATH, message: problem });

    const secrets: Record<string, string | undefined> = {};
    for (const key of SECRET_KEYS) secrets[key] = await this.container.secrets.get(key);
    errors.push(...findSecretLeaks(built.tree, secrets));

    return { agent, repo, existing, conflictAgentName, slug, built, errors };
  }
}

/** Static PR body: the file list + the secret note. No secret values. */
function prBody(built: BuiltCiFiles): string {
  const list = built.files.map((f) => `- \`${f.path}\``).join('\n');
  return [
    'Adds a DevDigest AI review to this repository’s pull-request CI.',
    '',
    '**Files**',
    list,
    '',
    '**Before merging:** add an `OPENROUTER_API_KEY` secret to this repository’s Actions secrets.',
    '`GITHUB_TOKEN` is provided automatically by GitHub Actions.',
  ].join('\n');
}
