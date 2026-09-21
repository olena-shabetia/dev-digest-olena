import type { Skill } from "@devdigest/shared";

/** Case-insensitive filter over a skill's name + description, mirroring
 *  `agents/_components/AgentsListView/helpers.ts`'s `filterAgents`. */
export function filterSkills(skills: Skill[], search: string): Skill[] {
  const q = search.trim().toLowerCase();
  if (!q) return skills;
  return skills.filter((s) => `${s.name} ${s.description}`.toLowerCase().includes(q));
}
