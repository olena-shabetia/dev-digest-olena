/**
 * Pure helpers for Export to CI: slugs, manifest, file tree, secret scan, zip,
 * ingest record, DTO mappers. No I/O, no SQL.
 */
import { createHash } from 'node:crypto';
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate';
import { stringify as yamlStringify } from 'yaml';
import {
  AgentManifest,
  CiResultArtifact,
  CiSlug,
  CiVerdict,
  type CiFile,
  type CiFileError,
  type CiInstallation,
  type CiRun,
  type WorkflowJobInfo,
  type WorkflowRunInfo,
} from '@devdigest/shared';
import {
  ARTIFACT_MAX_BYTES,
  CI_ARTIFACT_FILE,
  CI_MANIFEST_SCHEMA_VERSION,
  CI_MEMORY_PATH,
  CI_RUNNER_PATH,
  CI_WORKFLOW_PATH,
  SECRET_MIN_LENGTH,
} from './constants.js';

// ============================================================ slug

/** Lowercase, runs of non `[a-z0-9]` become `-`, trim `-`, cut to 100. */
export function toCiSlug(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 100);
}

// ============================================================ files

export interface CiAgentInput {
  name: string;
  version: number;
  provider: string;
  model: string;
  systemPrompt: string;
  strategy: string;
  ciFailOn: string;
}

export interface CiSkillInput {
  name: string;
  body: string;
}

/** A file as it will be committed / zipped (bytes, not the UI projection). */
export interface CiTreeFile {
  path: string;
  bytes: Uint8Array;
}

export function sha256Hex(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex');
}

export function agentManifestPath(slug: string): string {
  return `.devdigest/agents/${slug}.yaml`;
}

export function skillPath(slug: string): string {
  return `.devdigest/skills/${slug}.md`;
}

function zodMessage(err: { issues: { path: (string | number)[]; message: string }[] }): string {
  return err.issues.map((i) => `${i.path.join('.') || 'manifest'}: ${i.message}`).join('; ');
}

/** The validated manifest YAML, or an error message naming the cause. */
export function buildManifestYaml(
  agent: CiAgentInput,
  skillSlugs: string[],
): { yaml: string } | { error: string } {
  const parsed = AgentManifest.safeParse({
    schema_version: CI_MANIFEST_SCHEMA_VERSION,
    agent_version: agent.version,
    name: agent.name,
    provider: agent.provider,
    model: agent.model,
    system_prompt: agent.systemPrompt,
    skills: skillSlugs,
    strategy: agent.strategy,
    ci_fail_on: agent.ciFailOn,
  });
  if (!parsed.success) return { error: zodMessage(parsed.error) };
  return { yaml: yamlStringify(parsed.data) };
}

export interface BuiltCiFiles {
  files: CiFile[];
  errors: CiFileError[];
  /** Same files as bytes, in the same order, for commit/zip/secret scan. */
  tree: CiTreeFile[];
}

/**
 * Build the file list in the frozen order: manifest, skills, memory, runner,
 * workflow. A problem becomes a CiFileError naming the path; it never throws.
 */
export function buildCiFiles(
  agent: CiAgentInput,
  enabledSkills: CiSkillInput[],
  workflowText: string,
  bundle: Uint8Array | null,
  slug: string,
): BuiltCiFiles {
  const files: CiFile[] = [];
  const errors: CiFileError[] = [];
  const tree: CiTreeFile[] = [];

  const push = (path: string, contents: string | null, bytes: Uint8Array, editable: boolean) => {
    files.push({ path, contents, editable, size_bytes: bytes.byteLength, sha256: sha256Hex(bytes) });
    tree.push({ path, bytes });
  };
  const pushText = (path: string, contents: string, editable = false) =>
    push(path, contents, strToU8(contents), editable);

  // Skills first (their slugs feed the manifest), emitted after the manifest.
  const skillFiles: { path: string; body: string }[] = [];
  const skillSlugs: string[] = [];
  const seen = new Set<string>();
  for (const skill of enabledSkills) {
    const s = toCiSlug(skill.name);
    const path = skillPath(s || '(empty)');
    if (!CiSlug.safeParse(s).success) {
      errors.push({ path, message: `Skill name "${skill.name}" cannot be turned into a valid slug` });
      continue;
    }
    if (seen.has(s)) {
      errors.push({ path, message: `Two skills share the slug "${s}"` });
      continue;
    }
    seen.add(s);
    skillSlugs.push(s);
    skillFiles.push({ path, body: skill.body });
  }

  const manifestPath = agentManifestPath(slug);
  if (!CiSlug.safeParse(slug).success) {
    errors.push({ path: manifestPath, message: `Agent name "${agent.name}" cannot be turned into a valid slug` });
  } else {
    const built = buildManifestYaml(agent, skillSlugs);
    if ('error' in built) errors.push({ path: manifestPath, message: built.error });
    else pushText(manifestPath, built.yaml);
  }

  for (const f of skillFiles) pushText(f.path, f.body);
  pushText(CI_MEMORY_PATH, '');

  if (bundle) push(CI_RUNNER_PATH, null, bundle, false);
  else {
    errors.push({
      path: CI_RUNNER_PATH,
      message: 'Runner bundle not found — run `pnpm build` in agent-runner/',
    });
    files.push({ path: CI_RUNNER_PATH, contents: null, editable: false, size_bytes: 0, sha256: sha256Hex(new Uint8Array()) });
  }

  pushText(CI_WORKFLOW_PATH, workflowText, true);
  return { files, errors, tree };
}

/**
 * One CiFileError per file whose bytes contain a secret value (>= 8 chars).
 * The message names the KEY, never the value.
 */
export function findSecretLeaks(
  tree: CiTreeFile[],
  secrets: Record<string, string | undefined>,
): CiFileError[] {
  const out: CiFileError[] = [];
  for (const [key, value] of Object.entries(secrets)) {
    if (!value || value.length < SECRET_MIN_LENGTH) continue;
    for (const f of tree) {
      if (Buffer.from(f.bytes.buffer, f.bytes.byteOffset, f.bytes.byteLength).includes(value)) {
        out.push({ path: f.path, message: `Contains the value of ${key}` });
      }
    }
  }
  return out;
}

export function buildZip(tree: CiTreeFile[]): Uint8Array {
  const entries: Record<string, Uint8Array> = {};
  for (const f of tree) entries[f.path] = f.bytes;
  return zipSync(entries);
}

export function zipFilename(slug: string): string {
  return `devdigest-ci-${slug}.zip`;
}

// ============================================================ ingest

/** Parsed JSON of `devdigest-result.json` from an artifact zip, or null. */
export function readArtifactJson(zip: Uint8Array): unknown {
  try {
    const entries = unzipSync(zip, {
      filter: (f) => f.name === CI_ARTIFACT_FILE && f.originalSize <= ARTIFACT_MAX_BYTES,
    });
    const bytes = entries[CI_ARTIFACT_FILE];
    if (!bytes || bytes.byteLength > ARTIFACT_MAX_BYTES) return null;
    return JSON.parse(strFromU8(bytes));
  } catch {
    return null;
  }
}

export interface IngestInstallation {
  id: string;
  agentId: string;
  repo: string;
  githubRepoId: number;
}

export interface IngestRecord {
  installationId: string;
  agentId: string;
  repo: string;
  workflowRunId: number;
  runAttempt: number;
  headSha: string;
  conclusion: string | null;
  prNumber: number | null;
  ranAt: Date;
  status: 'completed' | 'failed';
  error: string | null;
  verdict: CiVerdict | null;
  findingsCount: number | null;
  costUsd: number | null;
  blockers: number | null;
  model: string | null;
  schemaVersion: number | null;
  agentVersion: number | null;
  runnerVersion: string | null;
  durationMs: number | null;
  jobUrl: string | null;
}

function jobDurationMs(job: WorkflowJobInfo | undefined): number | null {
  if (!job?.started_at || !job.completed_at) return null;
  const ms = Date.parse(job.completed_at) - Date.parse(job.started_at);
  return Number.isFinite(ms) && ms >= 0 ? ms : null;
}

/**
 * Turn a GitHub run + its jobs + its artifact into a record to persist.
 * Repo, PR number, head SHA, conclusion and job URL ALWAYS come from `run` /
 * `jobs[0]`; the artifact only supplies review fields (crit. 21). Returns null
 * for runs to ignore (other repository, skipped fork runs).
 */
export function toIngestRecord(input: {
  run: WorkflowRunInfo;
  jobs: WorkflowJobInfo[];
  artifactZip: Uint8Array | null;
  installation: IngestInstallation;
}): IngestRecord | null {
  const { run, jobs, artifactZip, installation } = input;
  if (run.repository_id !== installation.githubRepoId) return null;
  if (run.conclusion === 'skipped') return null;

  const job = jobs[0];
  const base = {
    installationId: installation.id,
    agentId: installation.agentId,
    repo: installation.repo,
    workflowRunId: run.id,
    runAttempt: run.run_attempt,
    headSha: run.head_sha,
    conclusion: run.conclusion,
    prNumber: run.pr_number,
    ranAt: new Date(run.run_started_at ?? run.created_at),
    durationMs: jobDurationMs(job),
    jobUrl: job?.html_url ?? null,
  };
  const failed = (error: string): IngestRecord => ({
    ...base,
    status: 'failed',
    error,
    verdict: null,
    findingsCount: null,
    costUsd: null,
    blockers: null,
    model: null,
    schemaVersion: null,
    agentVersion: null,
    runnerVersion: null,
  });

  if (!artifactZip) return failed('no artifact');
  const raw = readArtifactJson(artifactZip);
  if (raw === null) return failed('no artifact');
  const parsed = CiResultArtifact.safeParse(raw);
  if (!parsed.success || parsed.data.head_sha !== run.head_sha) return failed('artifact rejected');

  const a = parsed.data;
  return {
    ...base,
    status: 'completed',
    error: null,
    verdict: a.verdict,
    findingsCount: a.findings_count,
    costUsd: a.cost_usd,
    blockers: a.blockers,
    model: a.model,
    schemaVersion: a.schema_version,
    agentVersion: a.agent_version,
    runnerVersion: a.version ?? null,
  };
}

// ============================================================ DTO mappers

function iso(d: Date | null | undefined): string {
  return (d ?? new Date(0)).toISOString();
}

function toVerdict(v: string | null | undefined): CiVerdict | null {
  const p = CiVerdict.safeParse(v);
  return p.success ? p.data : null;
}

export interface InstallationRowLike {
  id: string;
  agentId: string;
  agentName: string | null;
  repo: string;
  targetType: 'gha' | 'circle' | 'jenkins' | 'cli';
  agentVersion: number;
  prUrl: string;
  installedAt: Date;
  updatedAt: Date;
}

export interface LatestRunLike {
  status: string | null;
  verdict: string | null;
  ranAt: Date | null;
}

export function toCiInstallationDto(
  row: InstallationRowLike,
  latest: LatestRunLike | null,
): CiInstallation {
  return {
    id: row.id,
    agent_id: row.agentId,
    agent_name: row.agentName,
    repo: row.repo,
    target_type: row.targetType,
    agent_version: row.agentVersion,
    pr_url: row.prUrl,
    installed_at: iso(row.installedAt),
    updated_at: iso(row.updatedAt),
    latest_run: latest
      ? {
          status: latest.status === 'completed' ? 'completed' : 'failed',
          verdict: toVerdict(latest.verdict),
          ran_at: iso(latest.ranAt),
        }
      : null,
  };
}

export interface CiRunRowLike {
  id: string;
  installationId: string | null;
  repo: string;
  prNumber: number | null;
  agentId: string | null;
  agentName: string | null;
  status: string | null;
  error: string | null;
  verdict: string | null;
  findingsCount: number | null;
  costUsd: number | null;
  durationMs: number | null;
  jobUrl: string | null;
  ranAt: Date | null;
}

export function toCiRunDto(row: CiRunRowLike): CiRun {
  return {
    id: row.id,
    installation_id: row.installationId,
    repo: row.repo,
    pr_number: row.prNumber,
    agent_id: row.agentId,
    agent_name: row.agentName,
    status: row.status === 'completed' ? 'completed' : 'failed',
    error: row.error,
    verdict: toVerdict(row.verdict),
    findings_count: row.findingsCount,
    cost_usd: row.costUsd,
    duration_ms: row.durationMs,
    job_url: row.jobUrl,
    ran_at: iso(row.ranAt),
  };
}
