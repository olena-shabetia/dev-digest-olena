/* RunList — the newest multi-agent runs for the active repo, below the
   Configure run section. Each row links to its results page. */
"use client";

import React from "react";
import Link from "next/link";
import { useTranslations } from "next-intl";
import { Badge, EmptyState, Skeleton } from "@devdigest/ui";
import { useActiveRepo } from "@/lib/repo-context";
import { useMultiAgentRuns } from "@/lib/hooks/multi-agent";
import { formatCost } from "@/lib/format";
import { multiAgentRunHref } from "@/lib/multi-agent";
import { statusAppearance } from "./helpers";
import { s } from "./styles";

export function RunList() {
  const t = useTranslations("multiAgent");
  const { activeRepo } = useActiveRepo();
  const { data: runs, isLoading } = useMultiAgentRuns(activeRepo?.id ?? null);

  return (
    <section style={s.root}>
      <div style={s.heading}>{t("list.heading")}</div>
      {isLoading ? (
        <>
          <Skeleton height={48} />
          <Skeleton height={48} />
        </>
      ) : !runs || runs.length === 0 ? (
        <EmptyState icon="Users" title={t("list.empty.title")} body={t("list.empty.body")} />
      ) : (
        runs.map((run) => {
          const appearance = statusAppearance(run.status);
          const cost =
            run.totals.cost_usd == null
              ? t("estimate.none")
              : `${run.totals.cost_partial ? "≥" : ""}${formatCost(run.totals.cost_usd)}`;
          return (
            <Link key={run.id} href={multiAgentRunHref(run.id)} style={s.row}>
              <Badge color={appearance.color} bg={appearance.bg} icon={appearance.icon}>
                {t(`list.status.${run.status}`)}
              </Badge>
              <span style={s.title}>
                #{run.pr_number} {run.pr_title}
              </span>
              <span style={s.meta}>
                <span>{t("list.agentCount", { count: run.agent_count })}</span>
                <span>{cost}</span>
                <span>{new Date(run.ran_at).toLocaleString()}</span>
              </span>
            </Link>
          );
        })
      )}
    </section>
  );
}

export default RunList;
