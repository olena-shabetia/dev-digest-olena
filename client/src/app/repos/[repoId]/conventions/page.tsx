import { ConventionsView } from "./_components/ConventionsView";

/* Route: /repos/:repoId/conventions (HW2 — Conventions Extractor). Thin route
   entry — the view, its cards, create-skill modal, hooks, styles and i18n
   are all colocated under _components/ConventionsView. */
export default function ConventionsPage() {
  return <ConventionsView />;
}
