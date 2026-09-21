import { TYPE_COLOR } from "./constants";

/** Resolve the icon-box colour for a skill's type. */
export function typeColor(type: string): string {
  return TYPE_COLOR[type] ?? "var(--text-secondary)";
}
