import { diffLines } from "diff";

export interface PromptLine {
  kind: "added" | "removed" | "same";
  text: string;
}

/** Line-level diff of the two prompts as prefixed lines (`+ ` / `- ` / `  `). */
export function promptDiffLines(base: string, head: string): PromptLine[] {
  const out: PromptLine[] = [];
  for (const part of diffLines(base, head)) {
    const kind = part.added ? "added" : part.removed ? "removed" : "same";
    const lines = part.value.split("\n");
    if (lines[lines.length - 1] === "") lines.pop();
    for (const text of lines) out.push({ kind, text });
  }
  return out;
}

export const LINE_PREFIX = { added: "+ ", removed: "- ", same: "  " } as const;

export function skillsLabel(skills: { name: string; version: number }[], none: string): string {
  return skills.length === 0 ? none : skills.map((k) => `${k.name} v${k.version}`).join(", ");
}

export function deltaDirection(d: number | null): "up" | "down" | "flat" | null {
  if (d == null) return null;
  return d > 0 ? "up" : d < 0 ? "down" : "flat";
}
