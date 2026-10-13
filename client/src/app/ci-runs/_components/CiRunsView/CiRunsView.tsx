/* CiRunsView — flat list of ingested CI runs with a manual Refresh (crit. 20, 23–25). */
"use client";

import type React from "react";
import { useTranslations } from "next-intl";
import { Button, ErrorState, Skeleton } from "@devdigest/ui";
import { CiRunsTable } from "@/components/ci-runs-table";
import { useCiRuns } from "@/lib/hooks/ci";

const s = {
  page: { padding: "28px 36px", maxWidth: 1200, display: "flex", flexDirection: "column", gap: 20 },
  header: { display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: 16, flexWrap: "wrap" },
  title: { fontSize: 26, fontWeight: 700, color: "var(--text-primary)" },
  subtitle: { fontSize: 14, color: "var(--text-secondary)", marginTop: 4 },
  list: { display: "flex", flexDirection: "column", gap: 10 },
} as const satisfies Record<string, React.CSSProperties>;

export function CiRunsView() {
  const t = useTranslations("ci.runs");
  const { data, isLoading, isError, isFetching, refetch } = useCiRuns();

  return (
    <div style={s.page}>
      <div style={s.header}>
        <div>
          <h1 style={s.title}>{t("title")}</h1>
          <p style={s.subtitle}>{t("subtitle")}</p>
        </div>
        <Button kind="secondary" size="sm" icon="RefreshCw" loading={isFetching} onClick={() => refetch()}>
          {isFetching ? t("refreshing") : t("refresh")}
        </Button>
      </div>

      {isError ? (
        <ErrorState onRetry={() => refetch()} />
      ) : isLoading || !data ? (
        <div style={s.list}>
          <Skeleton height={48} />
          <Skeleton height={200} />
        </div>
      ) : (
        <CiRunsTable
          runs={data.runs}
          ingestErrors={data.ingest_errors}
          emptyTitle={t("emptyTitle")}
          emptyBody={t("emptyBody")}
        />
      )}
    </div>
  );
}
