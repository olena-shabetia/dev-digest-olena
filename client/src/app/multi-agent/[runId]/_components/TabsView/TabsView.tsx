/* TabsView — one tab per child (criteria 54-57). The selected tab is
   URL-dependent state owned by the page; this component only renders it.
   Findings use the shared FindingCard — no new finding-action endpoint, and
   no out-of-scope action buttons (v1 does not render those). */
"use client";

import { useTranslations } from "next-intl";
import { Tabs, EmptyState } from "@devdigest/ui";
import type { MultiAgentChild } from "@devdigest/shared";
import { FindingCard } from "@/components/finding-card";
import { useEvalCaseModal } from "@/components/eval-case-modal";
import { useFindingAction } from "@/lib/hooks/reviews";
import { AgentSummaryCard } from "./_components/AgentSummaryCard";
import { s } from "./styles";

export function TabsView({
  prId,
  runChildren,
  selectedRunId,
  onSelectRunId,
  onOpenTrace,
  onFindingActed,
}: {
  prId: string;
  runChildren: readonly MultiAgentChild[];
  selectedRunId: string | null;
  onSelectRunId: (runId: string) => void;
  onOpenTrace: (runId: string, agentName: string | null) => void;
  onFindingActed: () => void;
}) {
  const t = useTranslations("multiAgentResults");
  const evalModal = useEvalCaseModal();
  const findingAction = useFindingAction();

  const active = runChildren.find((c) => c.run.run_id === selectedRunId) ?? runChildren[0];
  const findings = active?.review?.findings ?? [];

  return (
    <div style={s.root}>
      <Tabs
        tabs={runChildren.map((c) => ({
          key: c.run.run_id,
          label: c.run.agent_name ?? t("agentFallback"),
          count: c.run.status === "done" && c.review?.score != null ? c.review.score : undefined,
        }))}
        value={active?.run.run_id ?? ""}
        onChange={onSelectRunId}
      />

      {active && <AgentSummaryCard child={active} onOpenTrace={onOpenTrace} />}

      <div style={s.findings}>
        {active?.run.status === "done" && findings.length === 0 && (
          <EmptyState icon="CheckCircle" title={t("column.noFindings")} />
        )}
        {findings.map((f) => (
          <FindingCard
            key={f.id}
            f={f}
            onAction={(action) =>
              findingAction.mutate(
                { findingId: f.id, action, prId },
                { onSuccess: onFindingActed },
              )
            }
            pending={findingAction.isPending}
            onCreateEvalCase={evalModal ? () => evalModal.openForFinding(f.id) : undefined}
          />
        ))}
      </div>
    </div>
  );
}

export default TabsView;
