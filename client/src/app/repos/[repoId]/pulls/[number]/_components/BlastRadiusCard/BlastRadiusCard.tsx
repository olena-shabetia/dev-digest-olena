/* BlastRadiusCard — shows what a PR's changed symbols can break: their
   callers (file:line) and the HTTP endpoints / cron jobs those callers sit
   in. One consumer (the PR Overview tab), so it stays route-local
   (client/INSIGHTS.md 2026-09-18 "promote on second consumer"). All shaping
   (grouping, counts, summary) is server-computed — this only renders it.
   See client/specs/L04-blast-radius.ui.md. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Card, Chip, EmptyState, ErrorState, Icon, SectionLabel, Skeleton } from "@devdigest/ui";
import { useBlastRadius } from "@/lib/hooks/reviews";
import { BlastTree } from "./_components/BlastTree";
import { BlastGraph } from "./_components/BlastGraph";
import { BLAST_VIEWS, type BlastView } from "./constants";
import { degradedKey } from "./helpers";
import { s } from "./styles";

export function BlastRadiusCard({
  prId,
  repoFullName,
  headSha,
}: {
  prId: string | null;
  repoFullName: string | null;
  headSha: string;
}) {
  const t = useTranslations("blast");
  const tBrief = useTranslations("brief");
  const { data, isLoading, isError, refetch } = useBlastRadius(prId);
  const [view, setView] = React.useState<BlastView>(BLAST_VIEWS[0]);

  if (isLoading) {
    return (
      <Card>
        <div style={s.wrap}>
          <Skeleton height={16} width={160} />
          <Skeleton height={14} width="60%" />
          <Skeleton height={64} />
        </div>
      </Card>
    );
  }

  if (isError) {
    return (
      <Card>
        <ErrorState title={t("error.title")} body={t("error.body")} onRetry={() => refetch()} />
      </Card>
    );
  }

  if (!data) {
    return (
      <Card>
        <EmptyState icon="Zap" title={t("error.title")} body={t("error.body")} />
      </Card>
    );
  }

  const { stats, degraded, reason, downstream } = data;
  const showEmpty = downstream.length === 0 && !degraded;

  return (
    <Card>
      <div style={s.wrap}>
        <SectionLabel
          icon="Workflow"
          right={
            <div role="group" aria-label={t("viewToggle")} style={s.toggleGroup}>
              {BLAST_VIEWS.map((v) => (
                <Chip key={v} active={view === v} onClick={() => setView(v)}>
                  {t(`view.${v}`)}
                </Chip>
              ))}
            </div>
          }
        >
          {tBrief("block.blast")}
        </SectionLabel>

        <div style={s.statsRow}>
          <span style={s.statItem}>
            <Icon.Code size={13} />
            {stats.symbols} {t("stat.symbols")}
          </span>
          <span style={s.statItem}>
            <Icon.CornerDownRight size={13} />
            {stats.callers} {t("stat.callers")}
          </span>
          <span style={s.statItem}>
            <Icon.Globe size={13} />
            {stats.endpoints} {t("stat.endpoints")}
          </span>
          <span style={s.statItem}>
            <Icon.Clock size={13} />
            {stats.crons} {t("stat.crons")}
          </span>
        </div>

        {degraded && reason && (
          <div role="status" style={s.degradedRow}>
            <Icon.AlertTriangle size={14} />
            <span>{t(degradedKey(reason))}</span>
          </div>
        )}

        {showEmpty ? (
          <p style={s.emptyRow}>{t("noDownstream", { count: stats.symbols })}</p>
        ) : view === "tree" ? (
          <BlastTree data={data} repoFullName={repoFullName} headSha={headSha} />
        ) : (
          <BlastGraph data={data} repoFullName={repoFullName} headSha={headSha} />
        )}
      </div>
    </Card>
  );
}
