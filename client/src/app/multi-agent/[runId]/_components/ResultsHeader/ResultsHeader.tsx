/* ResultsHeader — Configure-run link, title + selected-agent count, totals
   (cost/duration), and the Columns/Tabs switch. Pure display over the frozen
   MultiAgentRunDetail contract: no grouping, no verdict or totals math here. */
"use client";

import { useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import type { MultiAgentRunDetail } from "@devdigest/shared";
import { formatCost, formatSeconds } from "@/lib/format";
import { childAgentIds } from "./helpers";
import { s } from "./styles";

export function ResultsHeader({
  detail,
  view,
  onViewChange,
  onConfigureRun,
}: {
  detail: MultiAgentRunDetail;
  view: "columns" | "tabs";
  onViewChange: (v: "columns" | "tabs") => void;
  onConfigureRun: (agentIds: string[]) => void;
}) {
  const t = useTranslations("multiAgentResults");

  const costText =
    detail.totals.cost_usd == null
      ? t("header.costUnknown")
      : `${detail.totals.cost_partial ? "≥" : ""}${formatCost(detail.totals.cost_usd)}`;
  const durationText = detail.totals.in_progress
    ? t("header.durationInProgress")
    : detail.totals.duration_ms == null
      ? t("header.durationUnknown")
      : formatSeconds(detail.totals.duration_ms);

  return (
    <div style={s.root}>
      <div style={s.topRow}>
        <div style={s.titleGroup}>
          <Button
            kind="secondary"
            size="sm"
            icon="Settings"
            onClick={() => onConfigureRun(childAgentIds(detail.children))}
          >
            {t("header.configureRun")}
          </Button>
          <span style={s.title}>{t("crumb")}</span>
          <span style={s.subtitle}>
            {t("header.selectedAgents", { count: detail.agent_count })}
          </span>
        </div>
        <div style={s.viewSwitch} role="group" aria-label={t("header.viewSwitchLabel")}>
          <Button
            kind="secondary"
            size="sm"
            active={view === "columns"}
            aria-pressed={view === "columns"}
            onClick={() => onViewChange("columns")}
          >
            {t("header.view.columns")}
          </Button>
          <Button
            kind="secondary"
            size="sm"
            active={view === "tabs"}
            aria-pressed={view === "tabs"}
            onClick={() => onViewChange("tabs")}
          >
            {t("header.view.tabs")}
          </Button>
        </div>
      </div>

      <div style={s.metaRow}>
        <div style={s.prLine}>
          <span style={s.prNumber}>#{detail.pr_number}</span>
          <span style={s.prTitle}>{detail.pr_title}</span>
        </div>
        <div style={s.summary}>
          {t("header.agentsSummary", {
            count: detail.agent_count,
            duration: durationText,
            cost: costText,
          })}
        </div>
      </div>
    </div>
  );
}

export default ResultsHeader;
