import { OnboardingTourView } from "./_components/OnboardingTourView";

/* Route: /repos/:repoId/onboarding (L05b — Onboarding Tour). Thin route entry —
   the view, section cards, styles and i18n are colocated under
   _components/OnboardingTourView. */
export default function OnboardingTourPage() {
  return <OnboardingTourView />;
}
