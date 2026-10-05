import type { OnboardingComplexity } from "@devdigest/shared";

/** Reuses the existing status tokens (see vendor/ui/styles.css). */
export const COMPLEXITY_TONE: Record<OnboardingComplexity, { color: string; bg: string }> = {
  low: { color: "var(--ok)", bg: "var(--ok-bg)" },
  medium: { color: "var(--warn)", bg: "var(--warn-bg)" },
  high: { color: "var(--crit)", bg: "var(--crit-bg)" },
};
