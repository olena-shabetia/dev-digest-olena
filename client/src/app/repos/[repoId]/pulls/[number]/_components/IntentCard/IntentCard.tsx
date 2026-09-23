/* IntentCard — shows the derived PR intent so a human can verify the system
   understood the task before reading findings. Structured like VerdictBanner
   (icon/heading + summary + chip rows); one consumer, so it stays route-local
   (client/INSIGHTS.md:18-41). See client/specs/L03-intent-layer.ui.md. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Card, SectionLabel, Chip, Button, EmptyState, Skeleton, Icon } from "@devdigest/ui";
import { usePrIntent, useDeriveIntent } from "@/lib/hooks/reviews";
import { CONFIDENCE_COLOR, SOURCE_STATUS_META } from "./constants";
import { s } from "./styles";

export function IntentCard({ prId }: { prId: string | null }) {
  const t = useTranslations("prReview");
  const { data, isLoading } = usePrIntent(prId);
  const derive = useDeriveIntent(prId);

  if (isLoading) {
    return (
      <Card>
        <div style={s.wrap}>
          <Skeleton height={16} width={160} />
          <Skeleton height={14} width="60%" />
          <Skeleton height={48} />
        </div>
      </Card>
    );
  }

  if (!data) {
    return (
      <Card>
        <EmptyState
          icon="Target"
          title={t("intent.emptyTitle")}
          body={t("intent.emptyBody")}
          cta={t("intent.rederive")}
          onCta={() => prId && derive.mutate()}
          ctaLoading={derive.isPending}
        />
      </Card>
    );
  }

  const unavailableGaps = data.sources.some((src) => src.status === "unavailable")
    ? data.context_gaps
    : [];

  return (
    <Card>
      <div style={s.wrap}>
        <div style={s.headerRow}>
          <SectionLabel icon="Target">{t("intent.heading")}</SectionLabel>
          <div style={s.headerActions}>
            <Chip color={CONFIDENCE_COLOR[data.confidence]}>
              {t(`intent.confidence.${data.confidence}`)}
            </Chip>
            <Button
              kind="ghost"
              size="sm"
              icon="RefreshCw"
              loading={derive.isPending}
              onClick={() => prId && derive.mutate()}
            >
              {t("intent.rederive")}
            </Button>
          </div>
        </div>

        {data.error ? (
          <p style={s.error}>{t("intent.error", { message: data.error })}</p>
        ) : (
          <p style={s.summary}>&ldquo;{data.intent}&rdquo;</p>
        )}

        <div style={s.columns}>
          <div style={s.column}>
            <span style={{ ...s.columnLabel, ...s.columnLabelIn }}>
              <Icon.Check size={12} />
              {t("intent.inScope")}
            </span>
            {data.in_scope.length === 0 ? (
              <span style={s.columnEmpty}>{t("intent.none")}</span>
            ) : (
              data.in_scope.map((item, i) => (
                <div key={i} style={s.columnItem}>
                  <span style={s.columnBullet}>&middot;</span>
                  <span>{item}</span>
                </div>
              ))
            )}
          </div>
          <div style={s.column}>
            <span style={s.columnLabel}>
              <Icon.X size={12} />
              {t("intent.outOfScope")}
            </span>
            {data.out_of_scope.length === 0 ? (
              <span style={s.columnEmpty}>{t("intent.none")}</span>
            ) : (
              data.out_of_scope.map((item, i) => (
                <div key={i} style={{ ...s.columnItem, ...s.columnItemOut }}>
                  <span style={s.columnBullet}>&middot;</span>
                  <span>{item}</span>
                </div>
              ))
            )}
          </div>
        </div>

        <div style={s.sourcesRow}>
          {data.sources.map((src, i) => {
            const meta = SOURCE_STATUS_META[src.status];
            return (
              <Chip key={i} icon={meta.icon} color={meta.color}>
                {t(`intent.sourceKind.${src.kind}`)}
                {src.status !== "absent" && src.ref ? ` · ${src.ref}` : ""}
              </Chip>
            );
          })}
        </div>

        {unavailableGaps.length > 0 && (
          <div style={s.contextGaps}>
            <span style={s.columnLabel}>{t("intent.contextGapsTitle")}</span>
            {unavailableGaps.map((gap, i) => (
              <span key={i}>{gap}</span>
            ))}
          </div>
        )}
      </div>
    </Card>
  );
}
