/* AgentColumn — one child's card in the Columns view (criteria 47-53). State
   comes ONLY from `run.status` (never derived from the SSE stream): running →
   spinner + compact live log; done → score ring + finding rows; failed /
   cancelled / unknown → status text + error. Exactly one SSE subscription,
   opened only while this child is running. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, CircularScore, EmptyState, Icon, LiveLogStream, SeverityBadge } from "@devdigest/ui";
import type { MultiAgentChild } from "@devdigest/shared";
import { formatCost, formatSeconds } from "@/lib/format";
import { useRunEvents } from "@/lib/hooks/reviews";
import { runEventsToLog } from "./helpers";
import { s } from "./styles";

export function AgentColumn({
  child,
  onOpenTrace,
  onSettled,
}: {
  child: MultiAgentChild;
  onOpenTrace: (runId: string, agentName: string | null) => void;
  onSettled: () => void;
}) {
  const t = useTranslations("multiAgentResults");
  const { run, review } = child;
  const running = run.status === "running";

  // Exactly one subscription per running column — the key collapses to ""
  // (no subscription at all) once the run is no longer running.
  const live = useRunEvents(running ? [run.run_id] : []);
  const prevLiveRunning = React.useRef(false);
  React.useEffect(() => {
    if (prevLiveRunning.current && !live.running) onSettled();
    prevLiveRunning.current = live.running;
  }, [live.running, onSettled]);

  const agentName = run.agent_name ?? t("agentFallback");
  const durationText = run.duration_ms == null ? t("column.unknown") : formatSeconds(run.duration_ms);
  const costText = run.cost_usd == null ? t("header.costUnknown") : formatCost(run.cost_usd);
  const findings = review?.findings ?? [];

  return (
    <div style={s.root}>
      <div style={s.header}>
        <div style={s.headerMain}>
          <span style={s.agentName} title={agentName}>
            {agentName}
          </span>
          <span style={s.meta}>
            {durationText} · {costText}
          </span>
        </div>
        {run.status === "done" && review?.score != null && <CircularScore score={review.score} size={36} stroke={3} />}
      </div>

      <div style={s.body}>
        {running && (
          <>
            <div style={s.statusRow}>
              <Icon.RefreshCw size={14} style={s.spin} />
              <span>{t("status.running")}</span>
            </div>
            <LiveLogStream log={runEventsToLog(live.events)} running height={160} />
          </>
        )}

        {!running && run.status === "done" && findings.length === 0 && (
          <EmptyState icon="CheckCircle" title={t("column.noFindings")} />
        )}

        {!running &&
          run.status === "done" &&
          findings.map((f) => (
            <div key={f.id} style={s.findingRow}>
              <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                <SeverityBadge severity={f.severity} compact />
                <span style={s.findingTitle} title={f.title}>
                  {f.title}
                </span>
              </div>
              <span style={s.findingLoc}>
                {f.file}:{f.start_line}
              </span>
            </div>
          ))}

        {!running && run.status !== "done" && (
          <div style={s.statusRow}>
            <span>{t(`status.${run.status === "cancelled" ? "cancelled" : "failed"}`)}</span>
          </div>
        )}
        {!running && run.status !== "done" && run.error && <div style={s.errorText}>{run.error}</div>}
      </div>

      <div style={s.footer}>
        <Button kind="tertiary" size="sm" onClick={() => onOpenTrace(run.run_id, run.agent_name)}>
          {t("column.viewTrace")}
        </Button>
        {run.status === "done" && (
          <span style={s.footerCount}>{t("column.findingsCount", { count: findings.length })}</span>
        )}
      </div>
    </div>
  );
}

export default AgentColumn;
