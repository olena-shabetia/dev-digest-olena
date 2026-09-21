import { TYPE_COLOR } from "./constants";

/** Resolve the icon-box colour for a skill's type. */
export function typeColor(type: string): string {
  return TYPE_COLOR[type] ?? "var(--text-secondary)";
}

/** `0.42` → `"42%"`; `null` → `"—"` (unknown, never a fabricated 0%). */
export function formatPercent(value: number | null): string {
  if (value == null) return "—";
  return `${Math.round(value * 100)}%`;
}
