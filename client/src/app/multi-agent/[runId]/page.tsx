/* /multi-agent/[runId] — the multi-agent run results page (L07). Columns or
   Tabs view over the server-computed MultiAgentRunDetail, plus the
   "Where agents disagree" block and the shared RunTraceDrawer. Every piece
   of state here (verdicts, groups, totals, status) comes from the frozen
   contract — nothing is recomputed on the client. */
"use client";

import React from "react";
import { useParams, useRouter, useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { EvalCaseModalProvider } from "@/components/eval-case-modal";
import RunTraceDrawer from "@/components/run-trace-drawer";
import { useMultiAgentRun } from "@/lib/hooks/multi-agent";
import { multiAgentConfigureHref } from "@/lib/multi-agent";
import { ApiError } from "@/lib/api";
import { ResultsHeader } from "./_components/ResultsHeader";
import { ColumnsView } from "./_components/ColumnsView";
import { TabsView } from "./_components/TabsView";
import { DisagreementBlock } from "./_components/DisagreementBlock";

type ResultsView = "columns" | "tabs";

export default function MultiAgentRunPage() {
  const params = useParams<{ runId: string }>();
  const router = useRouter();
  const search = useSearchParams();
  const t = useTranslations("multiAgentResults");
  const { runId } = params;

  const { data: detail, isLoading, isError, error, refetch } = useMultiAgentRun(runId);

  const setParam = (key: string, val: string | null) => {
    const sp = new URLSearchParams(search.toString());
    if (val == null) sp.delete(key);
    else sp.set(key, val);
    router.replace(`/multi-agent/${runId}${sp.toString() ? `?${sp.toString()}` : ""}`);
  };

  const view: ResultsView = search.get("view") === "tabs" ? "tabs" : "columns";
  const traceRunId = search.get("trace");

  const crumb = [{ label: t("crumb"), href: "/multi-agent" }, { label: `#${detail?.pr_number ?? ""}` }];

  if (isLoading || !detail) {
    if (isError) {
      return (
        <AppShell crumb={[{ label: t("crumb"), href: "/multi-agent" }]}>
          <ErrorState
            fullScreen
            onRetry={() => refetch()}
            body={error instanceof ApiError ? error.message : undefined}
          />
        </AppShell>
      );
    }
    return (
      <AppShell crumb={[{ label: t("crumb"), href: "/multi-agent" }]}>
        <div style={{ padding: "24px 32px 44px", display: "flex", gap: 16, maxWidth: 1080, margin: "0 auto" }}>
          <Skeleton height={220} width="33%" />
          <Skeleton height={220} width="33%" />
          <Skeleton height={220} width="33%" />
        </div>
      </AppShell>
    );
  }

  const selectedAgentRunId = search.get("agent") ?? detail.children[0]?.run.run_id ?? null;
  const traceChild = traceRunId ? detail.children.find((c) => c.run.run_id === traceRunId) : null;

  return (
    <EvalCaseModalProvider prId={detail.pr_id}>
      <AppShell crumb={crumb}>
        <div style={{ padding: "24px 32px 44px", display: "flex", flexDirection: "column", gap: 24, maxWidth: 1080, margin: "0 auto" }}>
          <ResultsHeader
            detail={detail}
            view={view}
            onViewChange={(v) => setParam("view", v)}
            onConfigureRun={(agentIds) =>
              router.push(multiAgentConfigureHref({ prId: detail.pr_id, agentIds }))
            }
          />

          {view === "columns" ? (
            <ColumnsView
              runChildren={detail.children}
              onOpenTrace={(id) => setParam("trace", id)}
              onSettled={() => refetch()}
            />
          ) : (
            <TabsView
              prId={detail.pr_id}
              runChildren={detail.children}
              selectedRunId={selectedAgentRunId}
              onSelectRunId={(id) => setParam("agent", id)}
              onOpenTrace={(id) => setParam("trace", id)}
              onFindingActed={() => refetch()}
            />
          )}

          <DisagreementBlock groups={detail.groups} childrenCount={detail.children.length} />
        </div>
      </AppShell>

      {traceRunId && (
        <RunTraceDrawer
          runId={traceRunId}
          prNumber={detail.pr_number}
          findings={traceChild?.review?.findings ?? []}
          agentName={traceChild?.run.agent_name ?? null}
          running={traceChild?.run.status === "running"}
          onClose={() => setParam("trace", null)}
        />
      )}
    </EvalCaseModalProvider>
  );
}
