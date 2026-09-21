import { SkillsListView } from "./_components/SkillsListView";

/* Route: /skills (Skills master-detail shell). Thin route entry — the view,
   its create modal, import drawer, editor, styles, constants, helpers and
   i18n are colocated under _components/SkillsListView. No nested route per
   skill (see specs/pages.md) — selection lives in the client view. */
export default function SkillsPage() {
  return <SkillsListView />;
}
