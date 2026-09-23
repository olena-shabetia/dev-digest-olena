/** Cycled fill colors for the findings-by-category Donut — categories are an
 *  open-ended `Record<string, number>` (unlike `Severity`, there's no fixed
 *  `SEV`-style token map for them), so this is a plain rotating palette, not a
 *  per-category color identity. */
export const CATEGORY_COLORS = [
  "var(--accent)",
  "var(--ok)",
  "var(--warn)",
  "var(--crit)",
  "var(--info)",
  "var(--sugg)",
] as const;
