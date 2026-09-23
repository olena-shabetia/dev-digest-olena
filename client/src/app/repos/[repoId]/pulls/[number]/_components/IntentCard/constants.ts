import type { IntentConfidence, IntentSourceStatus } from "@devdigest/shared";
import type { IconName } from "@devdigest/ui";

/** Confidence chip color — a different enum from `Severity`, so this is not
 *  the severity-colour-map anti-pattern (`client/INSIGHTS.md:138-159`); there
 *  is no existing token for `IntentConfidence`. */
export const CONFIDENCE_COLOR: Record<IntentConfidence, string> = {
  high: "var(--ok)",
  medium: "var(--warn)",
  low: "var(--crit)",
};

/** Icon + color per source status, for the Sources chip row. */
export const SOURCE_STATUS_META: Record<IntentSourceStatus, { icon: IconName; color: string }> = {
  used: { icon: "CheckCircle", color: "var(--ok)" },
  absent: { icon: "Dot", color: "var(--text-muted)" },
  unavailable: { icon: "AlertTriangle", color: "var(--warn)" },
};
