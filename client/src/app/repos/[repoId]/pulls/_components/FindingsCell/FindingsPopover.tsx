/* FindingsPopover — read-only preview of the PR's latest-review findings,
   shown on hover/focus over the FINDINGS column icons (see FindingsCell).
   Text only: severity icon, title, category, file:line, confidence, a short
   description. No buttons, no links — accept/dismiss lives only on the PR
   detail page's Review-runs accordion (FindingCard). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SeverityBadge, CategoryTag, ConfidenceNum, type Severity, type Category } from "@devdigest/ui";
import type { PrFindingPreview } from "@devdigest/shared";
import { s } from "./styles";
import { POPOVER_WIDTH } from "./constants";

export function FindingsPopover({
  id,
  total,
  preview,
  style,
}: {
  id: string;
  total: number;
  preview: PrFindingPreview[];
  style?: React.CSSProperties;
}) {
  const t = useTranslations("prReview");
  const more = total - preview.length;
  return (
    <div id={id} role="tooltip" style={{ ...s.popover, width: POPOVER_WIDTH, ...style }}>
      <div style={s.title}>{t("list.findings.title", { count: total })}</div>
      <div style={s.list}>
        {preview.map((f, i) => (
          <div key={i} style={s.row}>
            <SeverityBadge severity={f.severity as Severity} compact />
            <div style={s.rowMain}>
              <div style={s.rowTitleLine}>
                <span style={s.rowTitle}>{f.title}</span>
                <CategoryTag category={f.category as Category} />
              </div>
              <div style={s.rowMeta}>
                <span className="mono" style={s.location}>
                  {f.file}:{f.start_line === f.end_line ? f.start_line : `${f.start_line}-${f.end_line}`}
                </span>
                <ConfidenceNum value={f.confidence} />
              </div>
              <div style={s.description}>{f.description}</div>
            </div>
          </div>
        ))}
      </div>
      {more > 0 && <div style={s.more}>{t("list.findings.more", { count: more })}</div>}
    </div>
  );
}

export default FindingsPopover;
