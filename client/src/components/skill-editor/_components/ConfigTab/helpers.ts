/** Slugify a skill name for the LineNumberedEditor's filename header, e.g.
 *  "PR Quality Rubric" -> "pr-quality-rubric". */
export function slug(name: string): string {
  return (
    name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/(^-|-$)/g, "") || "skill"
  );
}
