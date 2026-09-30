import type { IconName } from "@devdigest/ui";
import type { RiskSeverity, Severity } from "@devdigest/shared";

/** Risk `kind` (free-form string from the model) -> icon. Unknown kinds fall
 *  back to RISK_KIND_FALLBACK_ICON. */
export const RISK_KIND_ICON: Record<string, IconName> = {
  security: "Shield",
  dependency: "Boxes",
  performance: "Zap",
  data: "Database",
  api_contract: "Link",
  concurrency: "Workflow",
  testing: "FlaskConical",
  other: "AlertTriangle",
};
export const RISK_KIND_FALLBACK_ICON: IconName = "AlertTriangle";

/** Which `SEV` token a risk severity borrows its colour from. */
export const RISK_SEVERITY_TOKEN: Record<RiskSeverity, Severity> = {
  high: "CRITICAL",
  medium: "WARNING",
  low: "SUGGESTION",
};

/** Middle-truncation threshold for ref link text. */
export const REF_MAX_CHARS = 48;
