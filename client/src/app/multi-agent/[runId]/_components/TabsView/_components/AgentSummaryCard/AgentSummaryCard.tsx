/* AgentSummaryCard — the Tabs view's per-child summary strip (criteria
   54-57): ring + summary + duration/cost + "View trace". State comes only
   from `run.status`. */
"use client";

import { useTranslations } from "next-intl";
import { Button, CircularScore } from "@devdigest/ui";
import type { MultiAgentChild } from "@devdigest/shared";
import { formatCost, formatSeconds } from "@/lib/format";
import { s } from "./styles";

export function AgentSummaryCard({
  child,
  onOpenTrace,
}: {
  child: MultiAgentChild;
  onOpenTrace: (runId: string, agentName: string | null) => void;
}) {
  const t = useTranslations("multiAgentResults");
  const { run, review } = child;
  const agentName = run.agent_name ?? t("agentFallback");
  const durationText = run.duration_ms == null ? t("column.unknown") : formatSeconds(run.duration_ms);
  const costText = run.cost_usd == null ? t("header.costUnknown") : formatCost(run.cost_usd);

  return (
    <div style={s.root}>
      {run.status === "done" && review?.score != null ? (
        <CircularScore score={review.score} size={44} />
      ) : (
        <div style={s.meta}>
          {t(`status.${run.status === "cancelled" ? "cancelled" : run.status === "running" ? "running" : "failed"}`)}
        </div>
      )}
      <div style={s.body}>
        <span style={s.name}>{agentName}</span>
        <span style={s.summary}>{review?.summary ?? t("tabs.noSummary")}</span>
        <span style={s.meta}>
          {durationText} · {costText}
        </span>
      </div>
      <div style={s.trailing}>
        <Button kind="tertiary" size="sm" onClick={() => onOpenTrace(run.run_id, run.agent_name)}>
          {t("tabs.viewTrace")}
        </Button>
      </div>
    </div>
  );
}

export default AgentSummaryCard;
