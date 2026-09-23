/* diff-viewer — unified-diff viewer with optional inline GitHub comments and
   Smart Diff (L03) grouping. Public surface: the DiffViewer component + the
   DiffCommentApi / DiffGroupView / DiffFindingsApi contracts. */
export { DiffViewer } from "./DiffViewer";
export type { DiffCommentApi } from "./comments";
export type { DiffGroupView } from "./groups";
export type { DiffFindingsApi } from "./findings";
export { anchorFindings } from "./findings";
