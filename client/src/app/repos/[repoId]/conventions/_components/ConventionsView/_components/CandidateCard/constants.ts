import type { ConventionCategory } from "@devdigest/shared";

/** Every `ConventionCategory` literal, for the inline-edit category select.
 *  Kept as a plain list (not imported off the zod enum) to match this
 *  codebase's convention of hand-listing enum members alongside a UI map —
 *  see SkillCard's `constants.ts#TYPE_COLOR` for the same pattern. */
export const CATEGORY_VALUES: readonly ConventionCategory[] = [
  "naming",
  "structure",
  "error-handling",
  "testing",
  "imports",
  "typing",
  "async",
  "styling",
  "other",
];

/** Evidence entries shown inline in "also seen in: …" before collapsing the
 *  rest into "+N more". */
export const ALSO_SEEN_IN_VISIBLE = 2;
