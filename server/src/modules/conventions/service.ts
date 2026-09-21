import type { Container } from '../../platform/container.js';
import type { ConventionCandidate, ConventionScan, Skill } from '@devdigest/shared';
import { ConventionsRepository } from './repository.js';
import { readConfigSamples, readCloneFile, diversifyByTopLevelDir } from './sampler.js';
import { buildExtractMessages } from './prompt.js';
import { ConventionExtraction, type PatchConventionBody } from './schemas.js';
import {
  dedupeCandidates,
  toConventionDto,
  toScanDto,
  buildSkillMarkdown,
  collectEvidenceFiles,
  verifyEvidence,
} from './helpers.js';
import type { SampledFile, VerifiedOccurrence } from './types.js';
import {
  CONVENTION_SKILL_NAME,
  CONVENTIONS_EXTRACT_JOB_KIND,
  DEFAULT_CONVENTIONS_MODEL,
  EXTRACTION_SCHEMA_NAME,
  SAMPLE_FILE_COUNT,
  SAMPLE_POOL_MULTIPLIER,
} from './constants.js';
import { NotFoundError, ValidationError } from '../../platform/errors.js';

/**
 * HW2 — Conventions extractor. Business logic only, zero SQL (server/AGENTS.md):
 * sampling → LLM → code-side verification → dedupe → persist, plus the
 * PATCH lifecycle and the accepted-only skill build. Every `repoIntel.*` call
 * and the single LLM call are wrapped so an enrichment/model failure
 * degrades the scan rather than crashing the request/job.
 */
export class ConventionsService {
  private repo: ConventionsRepository;

  constructor(private container: Container) {
    this.repo = new ConventionsRepository(container.db);
  }

  /** Register the extraction job handler once at app boot (routes.ts calls
   *  this at plugin load, mirroring `repo-intel/routes.ts:26-31`). */
  registerExtractJobHandler(): void {
    this.container.jobs.register(CONVENTIONS_EXTRACT_JOB_KIND, async (payload) => {
      const p = payload as { workspaceId: string; repoId: string; scanId: string };
      await this.runExtraction(p.workspaceId, p.repoId, p.scanId);
    });
  }

  /**
   * POST /repos/:id/conventions/extract. 422 up front (no tokens spent) when
   * the repo has no clone. Enqueues the actual extraction as a job so the
   * HTTP response returns immediately (criterion: survives a page reload).
   */
  async extract(workspaceId: string, repoId: string): Promise<{ scanId: string; jobId: string | null }> {
    const repo = await this.repo.getRepoCloneInfo(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');
    if (!repo.clonePath) {
      throw new ValidationError('Repo has no clone yet — index it before extracting conventions');
    }

    const sha = await this.repo.getLastIndexedSha(repoId);
    const scan = await this.repo.insertScan({ workspaceId, repoId, status: 'queued', sha });

    let jobId: string | null = null;
    try {
      const job = await this.container.jobs.enqueue(workspaceId, CONVENTIONS_EXTRACT_JOB_KIND, {
        workspaceId,
        repoId,
        scanId: scan.id,
      });
      jobId = job.id;
    } catch {
      // No handler registered / DB hiccup — leave the scan 'queued'; the UI
      // polls GET /repos/:id/conventions and sees it never progresses. This
      // mirrors repo-intel/routes.ts's degraded-enqueue path.
    }
    return { scanId: scan.id, jobId };
  }

  /** The actual extraction algorithm — runs inside the job handler so it
   *  survives the HTTP response closing. */
  async runExtraction(workspaceId: string, repoId: string, scanId: string): Promise<void> {
    const repo = await this.repo.getRepoCloneInfo(workspaceId, repoId);
    if (!repo || !repo.clonePath) {
      await this.repo.updateScan(scanId, {
        status: 'done',
        degraded: true,
        degradedReason: 'no_clone',
        finishedAt: new Date(),
      });
      return;
    }

    await this.repo.updateScan(scanId, { status: 'running' });
    const sha = await this.repo.getLastIndexedSha(repoId);

    // --- 1. Deterministic sampling (no LLM) ---------------------------------
    const configSamples = await readConfigSamples(repo.clonePath);

    let rankedPaths: string[] = [];
    try {
      rankedPaths = await this.container.repoIntel.getTopFilesByRank(
        repoId,
        SAMPLE_FILE_COUNT * SAMPLE_POOL_MULTIPLIER,
      );
    } catch {
      rankedPaths = []; // repo-intel enrichment never fails a run — degrade
    }
    const diversifiedPaths = diversifyByTopLevelDir(rankedPaths, SAMPLE_FILE_COUNT);
    const codeSamples: SampledFile[] = [];
    for (const path of diversifiedPaths) {
      const sample = await readCloneFile(repo.clonePath, path);
      if (sample) codeSamples.push(sample);
    }

    const samples = [...configSamples, ...codeSamples];

    if (samples.length === 0) {
      // Nothing to show the model at all — configs-only degrade with ZERO
      // LLM calls (server/AGENTS.md: enrichment failures never crash a run,
      // and here there's nothing to enrich).
      await this.repo.replacePendingCandidates(workspaceId, repoId, scanId, sha, []);
      await this.repo.updateScan(scanId, {
        status: 'done',
        candidatesProposed: 0,
        candidatesVerified: 0,
        degraded: true,
        degradedReason: this.container.config.repoIntelEnabled ? 'no_data' : 'flag_off',
        finishedAt: new Date(),
      });
      return;
    }

    // --- 2. Resolve the extraction model ------------------------------------
    const override = await this.repo.getConventionsModelOverride(workspaceId);
    const { provider, model } = override ?? DEFAULT_CONVENTIONS_MODEL;

    // --- 3. One structured-output LLM call ----------------------------------
    let proposed: ConventionExtraction;
    try {
      const llm = await this.container.llm(provider);
      const messages = buildExtractMessages(samples);
      const result = await llm.completeStructured({
        model,
        schema: ConventionExtraction,
        schemaName: EXTRACTION_SCHEMA_NAME,
        messages,
      });
      proposed = result.data;
    } catch (err) {
      await this.repo.updateScan(scanId, {
        status: 'failed',
        provider,
        model,
        error: err instanceof Error ? err.message : String(err),
        finishedAt: new Date(),
      });
      return; // nothing persisted on LLM failure
    }

    // --- 4. Code-side verification ------------------------------------------
    const sampledByPath = new Map(samples.map((s) => [s.path, s]));
    const rankIndex = new Map(diversifiedPaths.map((p, i) => [p, diversifiedPaths.length - i]));
    const verified: VerifiedOccurrence[] = [];
    for (const raw of proposed.candidates) {
      const occ = verifyEvidence(raw, sampledByPath, sha);
      if (occ) verified.push(occ);
    }

    // --- 5. Merge duplicates -------------------------------------------------
    const merged = dedupeCandidates(verified, (path) => rankIndex.get(path) ?? 0);

    // --- 6. Persist (preserving accepted/rejected decisions) -----------------
    await this.repo.replacePendingCandidates(workspaceId, repoId, scanId, sha, merged);

    const codeSampleDegraded = codeSamples.length === 0;
    await this.repo.updateScan(scanId, {
      status: 'done',
      provider,
      model,
      candidatesProposed: proposed.candidates.length,
      candidatesVerified: merged.length,
      degraded: codeSampleDegraded,
      degradedReason: codeSampleDegraded
        ? this.container.config.repoIntelEnabled
          ? 'no_ranked_files'
          : 'flag_off'
        : null,
      finishedAt: new Date(),
    });
  }

  /** GET /repos/:id/conventions — pure DB read, restart-durable. */
  async getConventions(
    workspaceId: string,
    repoId: string,
  ): Promise<{ scan: ConventionScan | null; candidates: ConventionCandidate[] }> {
    const repo = await this.repo.getRepoCloneInfo(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    const [scanRow, rows] = await Promise.all([
      this.repo.getLatestScan(workspaceId, repoId),
      this.repo.listCandidates(workspaceId, repoId),
    ]);
    const blobRef = { owner: repo.owner, name: repo.name };
    return {
      scan: scanRow ? toScanDto(scanRow) : null,
      candidates: rows.map((r) => toConventionDto(r, blobRef)),
    };
  }

  /**
   * PATCH /conventions/:id — `{status?, rule?, category?}`. Editing the rule
   * or category sets `edited: true`; a pure status flip does not (criteria
   * 47–49).
   */
  async patch(
    workspaceId: string,
    id: string,
    patch: PatchConventionBody,
  ): Promise<ConventionCandidate | undefined> {
    const existing = await this.repo.getCandidateById(workspaceId, id);
    if (!existing) return undefined;

    const editing = patch.rule !== undefined || patch.category !== undefined;
    const row = await this.repo.updateCandidate(workspaceId, id, {
      ...(patch.status !== undefined ? { status: patch.status } : {}),
      ...(patch.rule !== undefined ? { rule: patch.rule } : {}),
      ...(patch.category !== undefined ? { category: patch.category } : {}),
      ...(editing ? { edited: true } : {}),
    });
    if (!row) return undefined;

    const blobRef = (await this.repo.getRepoBlobRef(row.repoId ?? '')) ?? { owner: '', name: '' };
    return toConventionDto(row, blobRef);
  }

  /**
   * POST /repos/:id/conventions/skill — accepted-only markdown, upserted by
   * name (`repo-conventions`, `type: 'convention'`, `source: 'extracted'`).
   * With `agentId`, links via `linkSkill` (never `setSkills`, which would
   * unlink every other skill on that agent).
   */
  async buildSkill(workspaceId: string, repoId: string, agentId?: string): Promise<Skill> {
    const repo = await this.repo.getRepoCloneInfo(workspaceId, repoId);
    if (!repo) throw new NotFoundError('Repo not found');

    const acceptedRows = await this.repo.listAcceptedCandidates(workspaceId, repoId);
    const blobRef = { owner: repo.owner, name: repo.name };
    const acceptedDtos = acceptedRows.map((r) => toConventionDto(r, blobRef));

    const body = buildSkillMarkdown(acceptedDtos, `${repo.owner}/${repo.name}`);
    const evidenceFiles = collectEvidenceFiles(acceptedDtos);

    const existingSkills = await this.container.skillsRepo.list(workspaceId);
    const existing = existingSkills.find((s) => s.name === CONVENTION_SKILL_NAME);

    const skillRow = existing
      ? await this.container.skillsRepo.update(
          workspaceId,
          existing.id,
          { body, evidenceFiles },
          `Rebuilt from ${acceptedDtos.length} accepted convention${acceptedDtos.length === 1 ? '' : 's'}`,
        )
      : await this.container.skillsRepo.insert({
          workspaceId,
          name: CONVENTION_SKILL_NAME,
          description: `Repo conventions extracted from ${repo.owner}/${repo.name}.`,
          type: 'convention',
          source: 'extracted',
          body,
          enabled: true,
          evidenceFiles,
        });
    if (!skillRow) throw new NotFoundError('Skill not found');

    if (agentId) {
      const links = await this.container.agentsRepo.linkedSkills(agentId);
      const alreadyLinked = links.find((l) => l.skill.id === skillRow.id);
      const nextOrder = alreadyLinked ? alreadyLinked.order : links.length;
      await this.container.agentsRepo.linkSkill(agentId, skillRow.id, nextOrder);
    }

    return {
      id: skillRow.id,
      name: skillRow.name,
      description: skillRow.description,
      type: skillRow.type,
      source: skillRow.source,
      body: skillRow.body,
      enabled: skillRow.enabled,
      version: skillRow.version,
      evidence_files: skillRow.evidenceFiles ?? undefined,
    };
  }
}
