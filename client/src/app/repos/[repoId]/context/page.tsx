import { ProjectContextView } from "./_components/ProjectContextView";

/* Route: /repos/:repoId/context (L05 — Project Context). Thin route entry —
   the view, list/preview layout, styles and i18n are all colocated under
   _components/ProjectContextView. */
export default function ProjectContextPage() {
  return <ProjectContextView />;
}
