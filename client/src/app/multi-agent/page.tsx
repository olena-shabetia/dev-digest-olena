/* /multi-agent — Configure run screen + the run list (L07). Not repo-scoped
   in the route, but the Configure/RunList sections read the active repo
   themselves. The results page for one run is /multi-agent/[runId]. */
"use client";

import { useTranslations } from "next-intl";
import { AppShell } from "@/components/app-shell";
import { ConfigureRun } from "./_components/ConfigureRun";
import { RunList } from "./_components/RunList";

export default function MultiAgentPage() {
  const t = useTranslations("multiAgent");
  return (
    <AppShell crumb={[{ label: t("crumb") }, { label: t("configure.crumb") }]}>
      <div
        style={{
          padding: "24px 32px 44px",
          display: "flex",
          flexDirection: "column",
          gap: 24,
          maxWidth: 1080,
          margin: "0 auto",
        }}
      >
        <ConfigureRun />
        <RunList />
      </div>
    </AppShell>
  );
}
