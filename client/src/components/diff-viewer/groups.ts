/** DiffGroupView — a display-ready Smart Diff group, joined by the route
 *  (DiffTab/helpers.ts#toDiffGroupViews) from the server's SmartDiff groups
 *  and the PR's full PrFile list. The shared diff-viewer never recomputes
 *  roles, finding_lines, or total_lines — see client/specs/L03-smart-diff.ui.md. */
import type { SmartDiffRole, PrFile } from "@/lib/types";

export interface DiffGroupView {
  /** The server-classified role this group represents. */
  role: SmartDiffRole;
  /** Already translated by the route — diff-viewer takes no i18n namespace. */
  label: string;
  /** One-line, less-prominent description of what this role means for a
   *  reviewer (e.g. "The substance of the change — review closely"). */
  description: string;
  /** Full patches, ordered as GitHub returned them. */
  files: PrFile[];
  /** Count of files in this group with >=1 finding — the header's "●N" dot. */
  filesWithFindings: number;
  /** Pre-translated a11y label for the dot (never a literal in diff-viewer). */
  filesWithFindingsLabel: string;
  /** Pre-translated "{count} files" for the header (never a literal in diff-viewer). */
  filesCountLabel: string;
  /** True for 'docs' and 'boilerplate' — whether the group starts closed. */
  defaultCollapsed: boolean;
}
