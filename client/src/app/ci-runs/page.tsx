/* /ci-runs — CI Runs (L07). Not repo-scoped. */
"use client";

import { useTranslations } from "next-intl";
import { AppShell } from "@/components/app-shell";
import { CiRunsView } from "./_components/CiRunsView";

export default function CiRunsPage() {
  const t = useTranslations("ci.page");
  return (
    <AppShell crumb={[{ label: t("crumb") }]}>
      <CiRunsView />
    </AppShell>
  );
}
