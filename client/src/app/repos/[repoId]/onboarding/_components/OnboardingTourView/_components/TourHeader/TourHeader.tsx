/* TourHeader — title (accent repo name), index subline, Regenerate + Share. */
"use client";

import React from "react";
import { useFormatter, useTranslations } from "next-intl";
import { Button } from "@devdigest/ui";
import { formatFileCount } from "../../helpers";
import { s } from "../../styles";

export function TourHeader({
  repoName,
  filesIndexed,
  generatedAt,
  partial,
  regenerating,
  onRegenerate,
  onShare,
}: {
  repoName: string;
  filesIndexed: number;
  generatedAt: string;
  partial: boolean;
  regenerating: boolean;
  onRegenerate: () => void;
  onShare: () => void;
}) {
  const t = useTranslations("onboarding");
  const format = useFormatter();
  return (
    <div style={s.header}>
      <div style={s.headerRow}>
        <h1 style={s.title}>
          {t.rich("header.title", {
            repo: repoName,
            accent: (chunks) => <span style={s.accent}>{chunks}</span>,
          })}
        </h1>
        <div style={s.actions}>
          <Button kind="secondary" icon="RefreshCw" onClick={onRegenerate} disabled={regenerating}>
            {regenerating ? t("regenerating") : t("regenerate")}
          </Button>
          <Button kind="secondary" icon="Link" onClick={onShare}>
            {t("share.cta")}
          </Button>
        </div>
      </div>
      <div style={s.subline}>
        {t("header.subline", {
          files: formatFileCount(filesIndexed),
          relative: format.relativeTime(new Date(generatedAt)),
        })}
        {partial && (
          <span title={t("header.partialTooltip")}>
            {" · "}
            {t("header.partial")}
          </span>
        )}
      </div>
    </div>
  );
}
