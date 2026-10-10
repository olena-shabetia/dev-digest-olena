/* EvalRunButton — starts a set run for one agent and shows its progress.
   State comes entirely from the polled ["eval-runs", agentId] query. */
"use client";

import { useTranslations } from "next-intl";
import { Button, ProgressBar } from "@devdigest/ui";
import { useAgentEvalRuns, useStartEvalRun } from "@/lib/hooks/eval";
import { s } from "./styles";

export function EvalRunButton({ agentId }: { agentId: string }) {
  const t = useTranslations("eval.shared");
  const { data } = useAgentEvalRuns(agentId);
  const start = useStartEvalRun(agentId);

  const active = data?.active_run ?? null;
  const total = data?.cases_total ?? 0;
  const newest = data?.runs[0] ?? null;
  const failedReason = !active && newest?.status === "failed" ? (newest.error ?? "") : null;

  const empty = total === 0;
  const disabled = !data || empty || !!active || start.isPending;
  const progressPct = active && active.cases_total > 0 ? (active.cases_done / active.cases_total) * 100 : 0;

  return (
    <div style={s.wrap}>
      <Button
        kind="primary"
        icon="Play"
        disabled={disabled}
        loading={start.isPending}
        onClick={() => start.mutate()}
      >
        {active ? t("run.progress", { done: active.cases_done, total: active.cases_total }) : t("run.start")}
      </Button>
      {active ? (
        <ProgressBar value={progressPct} />
      ) : empty && data ? (
        <span style={s.hint}>{t("run.emptySet")}</span>
      ) : (
        <span style={s.hint}>{t("run.spendHint", { count: total })}</span>
      )}
      {failedReason != null && <span style={s.error}>{t("run.failed", { reason: failedReason })}</span>}
    </div>
  );
}
