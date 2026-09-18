/* FindingsCell — the PR list's FINDINGS column: severity icons for the PR's
   latest review, with a hover/focus popover titled "N FINDINGS IN THIS RUN"
   (scrollable, with a file:line link to GitHub). Portaled to document.body
   because the table row (`s.tableCard`, overflow: hidden) would otherwise
   clip it — see client/specs/L02-findings-by-severity.ui.md. */
"use client";

import React from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import type { PrMeta } from "@devdigest/shared";
import { SeverityFilterBar } from "@/components/severity-filter-bar";
import { severityBuckets } from "@/lib/severity";
import { FindingsPopover, useFindingsHoverPopover } from "@/components/findings-popover";
import { s } from "./styles";

export function FindingsCell({ pr, repoFullName }: { pr: PrMeta; repoFullName?: string | null }) {
  const t = useTranslations("prReview");
  const findings = pr.findings ?? null;
  const popoverId = `findings-popover-${pr.id ?? pr.number}`;

  const { triggerRef, popoverRef, open, placement, scheduleOpen, scheduleClose, close } = useFindingsHoverPopover(
    findings?.preview.length ?? 0,
  );

  if (!findings) {
    return <span style={s.none} title={t("list.findings.notReviewed")}>{t("list.findings.none")}</span>;
  }
  if (findings.total === 0) {
    // Reviewed and clean — a real, distinct state from "never reviewed"
    // (both would otherwise look identical as an empty cell).
    return <span style={s.none}>0</span>;
  }

  const buckets = severityBuckets(
    Array.from({ length: findings.critical }, () => ({ severity: "CRITICAL" }))
      .concat(Array.from({ length: findings.warning }, () => ({ severity: "WARNING" })))
      .concat(Array.from({ length: findings.suggestion }, () => ({ severity: "SUGGESTION" }))),
  );
  const ariaLabel = t("list.findings.cellAria", {
    count: findings.total,
    critical: findings.critical,
    warning: findings.warning,
    suggestion: findings.suggestion,
  });

  return (
    <div
      ref={triggerRef}
      style={s.cell}
      role="group"
      tabIndex={0}
      aria-describedby={open ? popoverId : undefined}
      aria-label={ariaLabel}
      onClick={(e) => e.stopPropagation()}
      onMouseEnter={scheduleOpen}
      onMouseLeave={scheduleClose}
      onFocus={scheduleOpen}
      onBlur={close}
      onKeyDown={(e) => {
        if (e.key === "Escape") close();
      }}
    >
      <SeverityFilterBar buckets={buckets} compact />
      {open &&
        placement &&
        createPortal(
          <FindingsPopover
            ref={popoverRef}
            id={popoverId}
            total={findings.total}
            preview={findings.preview}
            style={placement}
            repoFullName={repoFullName}
            headSha={pr.head_sha}
            onMouseEnter={scheduleOpen}
            onMouseLeave={scheduleClose}
            onClose={close}
          />,
          document.body,
        )}
    </div>
  );
}

export default FindingsCell;
