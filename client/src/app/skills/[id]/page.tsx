import { SkillFullPage } from "./_components/SkillFullPage";

/* Route: /skills/:id (HW2 criterion 25). Thin route entry — the view, its
   styles and i18n are all colocated under _components/SkillFullPage; the
   shared Skill Editor itself lives at @/components/skill-editor (promoted
   there because this route is its second consumer alongside the /skills
   list's side panel). */
export default function SkillPage() {
  return <SkillFullPage />;
}
