/* EvalsTab — the agent's eval cases + latest metrics. Read/maintain only:
   no "New eval case" (cases are made from decided findings), no per-row
   run, no history or Compare (those live on the Eval Dashboard). All counts
   and metrics come from the server. */
"use client";

import React, { useState } from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { ErrorState, Skeleton } from "@devdigest/ui";
import type { Agent, EvalCaseListItem } from "@devdigest/shared";
import { ConfirmDialog } from "@/components/confirm-dialog";
import { EvalCaseModalProvider, useEvalCaseModal } from "@/components/eval-case-modal";
import { EvalMetricCards } from "@/components/eval-metric-cards";
import { EvalRunButton } from "@/components/eval-run-button";
import { useAgentEvalRuns, useDeleteEvalCase, useEvalCases } from "@/lib/hooks/eval";
import { CaseRow } from "./_components/CaseRow";
import { s } from "./styles";

function EvalsTabBody({ agent }: { agent: Agent }) {
  const t = useTranslations("evalsTab");
  const tTab = useTranslations("eval.evalsTab");
  const shared = useTranslations("eval.shared");
  const modal = useEvalCaseModal();
  const cases = useEvalCases(agent.id);
  const runs = useAgentEvalRuns(agent.id);
  const del = useDeleteEvalCase(agent.id);
  const [pendingDelete, setPendingDelete] = useState<EvalCaseListItem | null>(null);

  const latest = runs.data?.latest_completed ?? null;
  const erroredCount = latest?.cases_errored ?? 0;

  return (
    <div style={s.wrap}>
      <section>
        <div style={s.metricsHead}>
          <span style={s.metricsTitle}>{tTab("metricsTitle")}</span>
          <Link href={`/eval/${agent.id}`} style={s.link}>
            {t("viewDashboard")}
          </Link>
        </div>
        {runs.isLoading ? (
          <Skeleton height={88} />
        ) : runs.isError ? (
          <ErrorState title={t("metricsErrorTitle")} body={t("metricsErrorBody")} onRetry={() => runs.refetch()} />
        ) : (
          <EvalMetricCards latest={latest} delta={runs.data?.delta ?? null} showPassCount />
        )}
      </section>

      <section style={{ display: "flex", flexDirection: "column", gap: 14 }}>
        <div style={s.casesHead}>
          <h2 style={s.heading}>{tTab("casesHeading")}</h2>
          {cases.data && (
            <span style={s.passing}>{t("passing", { passed: cases.data.cases_passing, total: cases.data.cases_total })}</span>
          )}
          {erroredCount > 0 && <span style={s.errored}>{shared("run.erroredCount", { count: erroredCount })}</span>}
          <span style={s.spacer} />
          <EvalRunButton agentId={agent.id} />
        </div>

        {cases.isLoading ? (
          <div style={s.list}>
            <Skeleton height={64} />
            <Skeleton height={64} />
            <Skeleton height={64} />
          </div>
        ) : cases.isError ? (
          <ErrorState title={t("loadErrorTitle")} body={t("loadErrorBody")} onRetry={() => cases.refetch()} />
        ) : cases.data && cases.data.cases.length === 0 ? (
          <p style={s.empty}>{tTab("emptyCases")}</p>
        ) : (
          <ul style={s.list} aria-label={t("casesList")}>
            {(cases.data?.cases ?? []).map((c) => (
              <CaseRow
                key={c.id}
                item={c}
                onEdit={() => modal?.openForCase(c.id)}
                onDelete={() => setPendingDelete(c)}
              />
            ))}
          </ul>
        )}
      </section>

      {pendingDelete && (
        <ConfirmDialog
          title={t("deleteTitle")}
          body={t("deleteBody", { name: pendingDelete.name })}
          confirmLabel={t("deleteConfirm")}
          loading={del.isPending}
          onClose={() => setPendingDelete(null)}
          onConfirm={() =>
            del.mutate(pendingDelete.id, { onSettled: () => setPendingDelete(null) })
          }
        />
      )}
    </div>
  );
}

export function EvalsTab({ agent }: { agent: Agent }) {
  return (
    <EvalCaseModalProvider>
      <EvalsTabBody agent={agent} />
    </EvalCaseModalProvider>
  );
}
