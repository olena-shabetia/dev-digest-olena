"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Checkbox, Icon } from "@devdigest/ui";
import { formatCost } from "@/lib/format";
import { formatEstimateDuration } from "@/lib/multi-agent";
import type { Agent, AgentRunEstimate } from "@devdigest/shared";
import { s } from "./styles";

export function AgentCard({
  agent,
  checked,
  onToggle,
  estimate,
  preview,
}: {
  agent: Agent;
  checked: boolean;
  onToggle: () => void;
  estimate: AgentRunEstimate | undefined;
  preview: string;
}) {
  const t = useTranslations("multiAgent");
  const duration = formatEstimateDuration(estimate?.avg_duration_ms ?? null);
  const cost = estimate?.avg_cost_usd != null ? formatCost(estimate.avg_cost_usd) : null;

  return (
    <div style={s.card}>
      <Checkbox checked={checked} onChange={onToggle} />
      <Icon.Cpu size={15} style={{ color: "var(--text-muted)", flexShrink: 0 }} />
      <div style={s.body}>
        <div style={s.name}>{agent.name}</div>
        <div style={s.preview} title={preview}>
          {preview}
        </div>
        <div style={s.estimate}>
          {duration ?? t("estimate.none")} · {cost ?? t("estimate.none")}
        </div>
      </div>
    </div>
  );
}

export default AgentCard;
