/* PrBriefCard — model-written PR summary on the Overview tab. Loads the cached
   brief (GET, no LLM) and generates/refreshes it on explicit user action.
   Model text is rendered as plain text. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Card, SectionLabel, Button, EmptyState, Skeleton, ErrorState } from "@devdigest/ui";
import type { ReviewRecord } from "@devdigest/shared";
import { usePrBrief, useGenerateBrief } from "@/lib/hooks/reviews";
import { VerdictBanner } from "../VerdictBanner";
import { costLine, hasLargePrGap, latestReviewBanner, visibleGaps } from "./helpers";
import { s } from "./styles";

export function PrBriefCard({
  prId,
  reviews,
}: {
  prId: string | null;
  reviews: ReviewRecord[] | undefined;
}) {
  const t = useTranslations("brief");
  const { data, isLoading, isError, refetch } = usePrBrief(prId);
  const generate = useGenerateBrief(prId);
  const pending = generate.isPending;
  const run = () => prId && generate.mutate();

  let content: React.ReactNode;
  const brief = data?.brief ?? null;

  if (isLoading || (pending && !brief)) {
    content = (
      <div style={s.body}>
        <Skeleton height={16} width="40%" />
        <Skeleton height={48} />
      </div>
    );
  } else if (isError && !data) {
    content = <ErrorState title={t("error")} onRetry={() => refetch()} />;
  } else if (!brief) {
    content = (
      <>
        <EmptyState
          icon="FileText"
          title={t("summaryEmptyTitle")}
          body={t("summaryEmptyBody")}
          cta={pending ? t("generating") : t("generate")}
          onCta={run}
          ctaLoading={pending}
        />
        {generate.isError && (
          <div style={{ ...s.errorRow, padding: "0 18px 18px", justifyContent: "center" }}>
            <p style={s.error}>{t("error")}</p>
            <Button size="sm" kind="secondary" disabled={pending} onClick={run}>
              {t("retry")}
            </Button>
          </div>
        )}
      </>
    );
  } else {
    const banner = latestReviewBanner(reviews);
    const gaps = visibleGaps(brief.meta.data_gaps);
    const cost = (
      <span style={s.cost} title={t("costTitle")}>
        {costLine(brief.meta)}
      </span>
    );
    content = (
      <div style={s.briefBody}>
        {data?.stale && (
          <div style={s.stale}>
            <span>{t("stale")}</span>
            <Button size="sm" kind="secondary" loading={pending} disabled={pending} onClick={run}>
              {t("regenerate")}
            </Button>
          </div>
        )}
        {banner ? (
          <VerdictBanner
            verdict={banner.verdict}
            summary={brief.summary}
            score={banner.score}
            findingsCount={banner.findingsCount}
            blockers={banner.blockers}
            scoreFooter={cost}
          />
        ) : (
          <div style={s.summaryBlock}>
            <p style={s.summaryText}>{brief.summary}</p>
            {cost}
          </div>
        )}
        {gaps.length > 0 && (
          <span style={s.note}>
            {t("gaps.label")} {gaps.map((g) => t(`gaps.${g}`)).join(", ")}
          </span>
        )}
        {hasLargePrGap(brief.meta.data_gaps) && <span style={s.note}>{t("gaps.largePr")}</span>}
        {pending && <span style={s.note}>{t("generating")}</span>}
        {generate.isError && (
          <div style={s.errorRow}>
            <span style={s.error}>{t("error")}</span>
            <Button size="sm" kind="secondary" disabled={pending} onClick={run}>
              {t("retry")}
            </Button>
          </div>
        )}
      </div>
    );
  }

  return (
    <div style={s.wrap}>
      <div style={s.headerRow}>
        <SectionLabel icon="FileText">{t("block.brief")}</SectionLabel>
        {brief && (
          <Button
            kind="ghost"
            size="sm"
            icon="RefreshCw"
            loading={pending}
            disabled={pending}
            aria-label={t("regenerateAria")}
            onClick={run}
          />
        )}
      </div>
      {/* With a brief, the VerdictBanner is already the card: no second frame. */}
      {brief ? content : <Card>{content}</Card>}
    </div>
  );
}
