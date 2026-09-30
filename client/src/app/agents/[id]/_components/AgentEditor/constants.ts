import type { IconName } from "@devdigest/ui";

/** Editor tab descriptor. `labelKey` resolves under the `agents` namespace. */
export interface EditorTab {
  key: string;
  labelKey: string;
  icon: IconName;
}

/** Editor tabs. Part-0 shipped Config only; L02 adds Skills; L05 adds
 *  Context (attach this repo's project-context documents).
 *  Stats stays unmounted (HW2 criterion 35 wanted exactly 2 tabs at the
 *  time) — the StatsTab component and GET /agents/:id/stats endpoint are
 *  left in the tree untouched, just not listed here. */
export const TABS: readonly EditorTab[] = [
  { key: "config", labelKey: "editor.tabs.config", icon: "Settings" },
  { key: "skills", labelKey: "editor.tabs.skills", icon: "Sparkles" },
  { key: "context", labelKey: "editor.tabs.context", icon: "FileText" },
];
