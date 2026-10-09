/* /eval/[agentId] — one agent's eval runs, metrics and Compare (L06). */
"use client";

import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { AppShell } from "@/components/app-shell";
import { useAgentEvalRuns } from "@/lib/hooks/eval";
import { EvalAgentView } from "./_components/EvalAgentView";

export default function EvalAgentPage() {
  const { agentId } = useParams<{ agentId: string }>();
  const t = useTranslations("eval.page");
  const { data } = useAgentEvalRuns(agentId);
  return (
    <AppShell
      crumb={[
        { label: t("crumbSkillsLab") },
        { label: t("crumbEvalDashboard"), href: "/eval" },
        { label: data?.agent.name ?? "…" },
      ]}
    >
      <EvalAgentView agentId={agentId} />
    </AppShell>
  );
}
