/* FindingsPopover — hover/focus preview of a review's findings (PR-list
   FINDINGS column, Agent-runs Timeline tiles). Severity icon, title,
   category, a clickable file:line (opens the line on GitHub, when
   `repoFullName`/`headSha` are known), confidence, and a short description.
   No accept/dismiss actions — those live only on the PR detail page's
   Review-runs accordion (FindingCard). Scrolls internally past
   POPOVER_MAX_VISIBLE_ROWS so a long finding list stays reachable. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SeverityBadge, CategoryTag, ConfidenceNum, type Severity, type Category } from "@devdigest/ui";
import type { PrFindingPreview } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";
import { s } from "./styles";
import { POPOVER_WIDTH } from "./constants";

export function FindingsPopover({
  ref,
  id,
  total,
  preview,
  style,
  repoFullName,
  headSha,
  onMouseEnter,
  onMouseLeave,
  onClose,
}: {
  ref?: React.Ref<HTMLDivElement>;
  id: string;
  total: number;
  preview: PrFindingPreview[];
  style?: React.CSSProperties;
  /** owner/repo + the commit the findings were reviewed against — when both
   *  are known, file:line becomes a link to that line on GitHub. */
  repoFullName?: string | null;
  headSha?: string | null;
  onMouseEnter?: () => void;
  onMouseLeave?: () => void;
  onClose?: () => void;
}) {
  const t = useTranslations("prReview");
  return (
    <div
      ref={ref}
      id={id}
      data-testid="findings-popover"
      aria-label={t("list.findings.title", { count: total })}
      style={{ ...s.popover, width: POPOVER_WIDTH, ...style }}
      onMouseEnter={onMouseEnter}
      onMouseLeave={onMouseLeave}
      onKeyDown={(e) => {
        if (e.key === "Escape") onClose?.();
      }}
    >
      <div style={s.title}>{t("list.findings.title", { count: total })}</div>
      <div style={s.list}>
        {preview.map((f, i) => {
          const href =
            repoFullName && headSha
              ? githubBlobUrl(repoFullName, headSha, f.file, f.start_line, f.end_line)
              : undefined;
          const location = (
            <>
              {f.file}:{f.start_line === f.end_line ? f.start_line : `${f.start_line}-${f.end_line}`}
            </>
          );
          return (
            <div key={i} style={s.row}>
              <SeverityBadge severity={f.severity as Severity} compact />
              <div style={s.rowMain}>
                <div style={s.rowTitleLine}>
                  <span style={s.rowTitle}>{f.title}</span>
                  <CategoryTag category={f.category as Category} />
                </div>
                <div style={s.rowMeta}>
                  {href ? (
                    // A plain anchor, not the vendored MonoLink — MonoLink is
                    // gray-until-hover by design (its convention on FindingCard),
                    // but this popover's design calls for an always-blue link.
                    <a
                      className="mono"
                      href={href}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={(e) => e.stopPropagation()}
                      style={s.link}
                    >
                      {location}
                    </a>
                  ) : (
                    <span className="mono" style={s.location}>
                      {location}
                    </span>
                  )}
                </div>
                <ConfidenceNum value={f.confidence} />
                <div style={s.description}>{f.description}</div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export default FindingsPopover;
