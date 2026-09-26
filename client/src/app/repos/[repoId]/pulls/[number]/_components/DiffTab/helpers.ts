/* Pure join between the server's Smart Diff groups (roles + finding_lines,
   no patch text) and the PR's full `PrFile[]` (patch text, no role) — the
   client never recomputes a role or a finding-line list, only joins what the
   server already derived. See client/specs/L03-smart-diff.ui.md. */
import type { FindingRecord } from "@devdigest/shared";
import type { DiffGroupView } from "@/components/diff-viewer";
import type { PrFile, SmartDiffResponse, SmartDiffRole } from "@/lib/types";

/** Groups that start collapsed by default — everything else starts open. */
const DEFAULT_COLLAPSED_ROLES: ReadonlySet<SmartDiffRole> = new Set(["docs", "boilerplate"]);

/**
 * Join `SmartDiffResponse.groups` to the PR's full `PrFile[]` by path,
 * translating each role's label via the caller-supplied map. Drops any group
 * with zero matching files (never rendered as an empty section).
 */
export function toDiffGroupViews(
  smartDiff: SmartDiffResponse | null | undefined,
  files: PrFile[],
  labels: Record<SmartDiffRole, string>,
  descriptions: Record<SmartDiffRole, string>,
  filesWithFindingsLabel: (count: number) => string,
  filesCountLabel: (count: number) => string,
): DiffGroupView[] {
  if (!smartDiff) return [];
  const filesByPath = new Map(files.map((f) => [f.path, f]));

  const views: DiffGroupView[] = [];
  for (const group of smartDiff.groups) {
    const groupFiles: PrFile[] = [];
    let filesWithFindings = 0;
    for (const sdFile of group.files) {
      const file = filesByPath.get(sdFile.path);
      if (!file) continue;
      groupFiles.push(file);
      if (sdFile.finding_lines.length > 0) filesWithFindings += 1;
    }
    if (groupFiles.length === 0) continue;
    views.push({
      role: group.role,
      label: labels[group.role],
      description: descriptions[group.role],
      files: groupFiles,
      filesWithFindings,
      filesWithFindingsLabel: filesWithFindingsLabel(filesWithFindings),
      filesCountLabel: filesCountLabel(groupFiles.length),
      defaultCollapsed: DEFAULT_COLLAPSED_ROLES.has(group.role),
    });
  }
  return views;
}

/** Groups a PR's latest-review findings by file path. Pure, React-free. */
export function findingsByPath(findings: FindingRecord[]): Map<string, FindingRecord[]> {
  const byPath = new Map<string, FindingRecord[]>();
  for (const f of findings) {
    const list = byPath.get(f.file) ?? [];
    list.push(f);
    byPath.set(f.file, list);
  }
  return byPath;
}
