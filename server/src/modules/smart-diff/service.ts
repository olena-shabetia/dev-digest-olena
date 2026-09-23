import type { Container } from '../../platform/container.js';
import type { SmartDiffResponse } from '@devdigest/shared';
import { NotFoundError } from '../../platform/errors.js';
import { classifyFile, toSmartDiffFile } from './helpers.js';
import { ROLE_ORDER } from './constants.js';

/**
 * L03 — Smart Diff business logic. Zero SQL (server/AGENTS.md): every read
 * goes through `container.reviewRepo` (`getPull`, `getPrFiles`,
 * `reviewsForPull` — already on `reviews/repository.ts`), never a sibling
 * module import (server/INSIGHTS.md 2026-09-21) and never a new
 * `container.smartDiff*` getter (D4, `server/specs/L03-smart-diff.api.md`).
 */
export class SmartDiffService {
  constructor(private container: Container) {}

  async getSmartDiff(workspaceId: string, prId: string): Promise<SmartDiffResponse> {
    const pull = await this.container.reviewRepo.getPull(workspaceId, prId);
    if (!pull) throw new NotFoundError('Pull request not found');

    const files = await this.container.reviewRepo.getPrFiles(prId);

    // Findings come from the PR's LATEST review only — `reviewsForPull`
    // returns newest-first, so element [0]. No review yet ⇒ every file's
    // `finding_lines` is `[]` (D9).
    const reviews = await this.container.reviewRepo.reviewsForPull(prId);
    const latest = reviews[0];

    const linesByPath = new Map<string, number[]>();
    if (latest) {
      for (const finding of latest.findings) {
        const existing = linesByPath.get(finding.file);
        if (existing) {
          if (!existing.includes(finding.startLine)) existing.push(finding.startLine);
        } else {
          linesByPath.set(finding.file, [finding.startLine]);
        }
      }
      for (const lines of linesByPath.values()) lines.sort((a, b) => a - b);
    }

    const byRole = new Map<(typeof ROLE_ORDER)[number], (typeof files)[number][]>();
    for (const role of ROLE_ORDER) byRole.set(role, []);
    for (const file of files) {
      const role = classifyFile(file.path);
      byRole.get(role)!.push(file);
    }

    const groups = ROLE_ORDER.map((role) => ({
      role,
      files: byRole.get(role)!.map((file) => toSmartDiffFile(file, linesByPath.get(file.path) ?? [])),
    }));

    const totalLines = files.reduce((sum, f) => sum + f.additions + f.deletions, 0);

    return {
      groups,
      split_suggestion: {
        too_big: false,
        total_lines: totalLines,
        proposed_splits: [],
      },
    };
  }
}
