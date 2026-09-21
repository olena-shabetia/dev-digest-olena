import type { Skill } from "@devdigest/shared";

export interface JoinedSkillRow {
  skill: Skill;
  linked: boolean;
}

/**
 * Joins the workspace skill catalog against this agent's local (possibly
 * optimistic) link order. Linked skills render first, in `order`; unlinked
 * skills follow, alphabetical — matches the mockup and `agents.skills.orderHint`.
 */
export function joinSkills(skills: Skill[], order: string[]): JoinedSkillRow[] {
  const byId = new Map(skills.map((skill) => [skill.id, skill]));
  const linked: JoinedSkillRow[] = order
    .map((id) => byId.get(id))
    .filter((skill): skill is Skill => !!skill)
    .map((skill) => ({ skill, linked: true }));

  const linkedIds = new Set(order);
  const unlinked: JoinedSkillRow[] = skills
    .filter((skill) => !linkedIds.has(skill.id))
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((skill) => ({ skill, linked: false }));

  return [...linked, ...unlinked];
}

/** Case-insensitive filter over name + description. Empty query matches all. */
export function matchesFilter(skill: Skill, query: string): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;
  return skill.name.toLowerCase().includes(q) || skill.description.toLowerCase().includes(q);
}
