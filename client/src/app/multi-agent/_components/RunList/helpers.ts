import type { IconName } from "@devdigest/ui";
import type { MultiAgentRunStatus } from "@devdigest/shared";

/** Status → (icon, color) pair — never color alone (an icon differentiates
 *  too), matching the PR page's run-history `outcomeOf` convention. */
export function statusAppearance(status: MultiAgentRunStatus): { icon: IconName; color: string; bg: string } {
  switch (status) {
    case "running":
      return { icon: "RefreshCw", color: "var(--accent)", bg: "var(--accent-bg)" };
    case "done":
      return { icon: "CheckCircle", color: "var(--ok)", bg: "var(--ok-bg)" };
    case "partial":
      return { icon: "AlertTriangle", color: "var(--warn)", bg: "var(--warn-bg)" };
    case "failed":
    default:
      return { icon: "XCircle", color: "var(--crit)", bg: "var(--crit-bg)" };
  }
}
