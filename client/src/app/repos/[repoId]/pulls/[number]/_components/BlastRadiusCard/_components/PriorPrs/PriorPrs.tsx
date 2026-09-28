/* PriorPrs — "Prior PRs touching these files" (P3, optional). Collapsed by
   default; expanding it triggers the (lazy, GitHub-API-backed) fetch, since
   this has no precomputed index and a real per-request GitHub cost
   (pr-history/service.ts). Never fetched just to render the collapsed row. */
"use client";

import React from "react";
import { useTranslations, useFormatter } from "next-intl";
import { Avatar, Badge, Icon, Skeleton } from "@devdigest/ui";
import { usePrHistory } from "@/lib/hooks/reviews";
import { githubPrUrl } from "@/lib/github-urls";
import { s } from "../../styles";

export function PriorPrs({
  prId,
  repoFullName,
}: {
  prId: string | null;
  repoFullName: string | null;
}) {
  const t = useTranslations("blast");
  const format = useFormatter();
  const [expanded, setExpanded] = React.useState(false);
  const { data, isLoading, isError } = usePrHistory(prId, expanded);

  return (
    <div>
      <button
        type="button"
        aria-expanded={expanded}
        aria-label={t(expanded ? "priorPrs.collapse" : "priorPrs.expand")}
        style={s.priorPrsHeader}
        onClick={() => setExpanded((v) => !v)}
      >
        <Icon.History size={14} />
        <span style={s.priorPrsTitle}>{t("priorPrs.title")}</span>
        {data && <Badge>{data.history.length}</Badge>}
        {expanded ? <Icon.ChevronUp size={14} /> : <Icon.ChevronDown size={14} />}
      </button>

      {expanded && (
        <div style={s.priorPrsList}>
          {isLoading && (
            <>
              <Skeleton height={14} width="70%" />
              <Skeleton height={14} width="55%" />
            </>
          )}
          {isError && <span style={s.priorPrMeta}>{t("priorPrs.error")}</span>}
          {!isLoading && !isError && data?.history.length === 0 && (
            <span style={s.priorPrMeta}>{t("priorPrs.empty")}</span>
          )}
          {!isLoading &&
            !isError &&
            data?.history.map((item) => (
              <div key={item.pr_number} style={s.priorPrItem}>
                <div style={s.priorPrTitleRow}>
                  <span style={s.priorPrBullet} />
                  {repoFullName ? (
                    <a href={githubPrUrl(repoFullName, item.pr_number)} target="_blank" rel="noopener noreferrer">
                      <span style={{ color: "var(--accent-text)" }}>#{item.pr_number}</span>{" "}
                      <span style={s.priorPrTitleText}>{item.title}</span>
                    </a>
                  ) : (
                    <span>
                      <span style={{ color: "var(--accent-text)" }}>#{item.pr_number}</span>{" "}
                      <span style={s.priorPrTitleText}>{item.title}</span>
                    </span>
                  )}
                </div>
                <div style={s.priorPrAuthorRow}>
                  <Avatar name={item.author} size={16} />
                  <span>{item.author}</span>
                  <span style={s.priorPrMeta}>
                    {format.dateTime(new Date(item.merged_at), { dateStyle: "medium" })}
                  </span>
                </div>
                <p style={s.priorPrNotes}>{item.notes}</p>
              </div>
            ))}
        </div>
      )}
    </div>
  );
}
