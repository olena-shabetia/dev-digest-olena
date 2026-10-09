/* /eval — Eval Dashboard index (L06). Not repo-scoped. */
"use client";

import { useTranslations } from "next-intl";
import { AppShell } from "@/components/app-shell";
import { EvalDashboardView } from "./_components/EvalDashboardView";

export default function EvalDashboardPage() {
  const t = useTranslations("eval.page");
  return (
    <AppShell crumb={[{ label: t("crumbSkillsLab") }, { label: t("crumbEvalDashboard") }]}>
      <EvalDashboardView />
    </AppShell>
  );
}
