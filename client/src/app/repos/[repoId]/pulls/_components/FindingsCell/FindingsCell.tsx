/* FindingsCell — the PR list's FINDINGS column: severity icons for the PR's
   latest review, with a read-only hover/focus popover titled
   "N FINDINGS IN THIS RUN". Portaled to document.body because the table row
   (`s.tableCard`, overflow: hidden) would otherwise clip it — see
   client/specs/L02-findings-by-severity.ui.md. */
"use client";

import React from "react";
import { createPortal } from "react-dom";
import { useTranslations } from "next-intl";
import type { PrMeta } from "@devdigest/shared";
import { SeverityFilterBar } from "@/components/severity-filter-bar";
import { severityBuckets } from "@/lib/severity";
import { FindingsPopover } from "./FindingsPopover";
import { estimateHeight, placePopover } from "./helpers";
import { HOVER_OPEN_MS } from "./constants";
import { s } from "./styles";

export function FindingsCell({ pr }: { pr: PrMeta }) {
  const t = useTranslations("prReview");
  const triggerRef = React.useRef<HTMLDivElement | null>(null);
  const openTimer = React.useRef<ReturnType<typeof setTimeout> | null>(null);
  const [open, setOpen] = React.useState(false);
  const [placement, setPlacement] = React.useState<{ top: number; left: number } | null>(null);

  const findings = pr.findings ?? null;
  const popoverId = `findings-popover-${pr.id ?? pr.number}`;

  const clearOpenTimer = React.useCallback(() => {
    if (openTimer.current) {
      clearTimeout(openTimer.current);
      openTimer.current = null;
    }
  }, []);

  const doOpen = React.useCallback(() => {
    if (!triggerRef.current || !findings) return;
    const rect = triggerRef.current.getBoundingClientRect();
    const height = estimateHeight(findings.preview.length, findings.total > findings.preview.length);
    setPlacement(placePopover(rect, height, { width: window.innerWidth, height: window.innerHeight }));
    setOpen(true);
  }, [findings]);

  const scheduleOpen = React.useCallback(() => {
    if (!findings) return;
    clearOpenTimer();
    openTimer.current = setTimeout(doOpen, HOVER_OPEN_MS);
  }, [clearOpenTimer, doOpen, findings]);

  const close = React.useCallback(() => {
    clearOpenTimer();
    setOpen(false);
  }, [clearOpenTimer]);

  // A portaled `position: fixed` popover doesn't track scroll/resize — close
  // rather than chase, and clear a pending open timer if the row unmounts
  // (e.g. a filter/sort change) before it fires.
  React.useEffect(() => {
    if (!open) return;
    window.addEventListener("scroll", close, { capture: true, passive: true });
    window.addEventListener("resize", close);
    return () => {
      window.removeEventListener("scroll", close, { capture: true });
      window.removeEventListener("resize", close);
    };
  }, [open, close]);
  React.useEffect(() => clearOpenTimer, [clearOpenTimer]);

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
      onMouseLeave={close}
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
            id={popoverId}
            total={findings.total}
            preview={findings.preview}
            style={placement}
          />,
          document.body,
        )}
    </div>
  );
}

export default FindingsCell;
