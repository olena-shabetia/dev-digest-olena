/* SeverityFilterBar — "N CRITICAL · N WARNING · N SUGGESTION" pills, shown only
   for severities actually present (client/lib/severity.ts). Two shapes:
     - interactive (onSelect supplied) — real <button>s, used by FindingsPanel's
       per-run filter and the PR-list FindingsCell popover trigger.
     - static (onSelect omitted) — plain <span>s, used by the run Timeline
       tiles, which show the shape of a run without letting you click into it.
   Colors/icons come from the vendored SEV tokens; labels are localized here
   (SEV.label is hardcoded English and *_/src/vendor/**_ is do-not-touch). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SEV, type Severity as UiSeverity } from "@devdigest/ui";
import type { Severity } from "@devdigest/shared";
import type { SeverityBucket } from "@/lib/severity";
import { s } from "./styles";

export function SeverityFilterBar({
  buckets,
  selected = null,
  onSelect,
  compact = false,
}: {
  buckets: SeverityBucket[];
  /** Highlighted severity, if any. Ignored when `onSelect` is omitted. */
  selected?: Severity | null;
  /** Omit for a read-only bar (Timeline tiles) — renders spans, not buttons. */
  onSelect?: (severity: Severity) => void;
  /** Icon + count only, no label — used where space is tight (Timeline, list). */
  compact?: boolean;
}) {
  const t = useTranslations("prReview");
  if (buckets.length === 0) return null;
  const interactive = !!onSelect;

  return (
    <div style={s.bar} role={interactive ? "group" : undefined} aria-label={interactive ? t("severityFilter.groupLabel") : undefined}>
      {buckets.map(({ severity, count }) => {
        const meta = SEV[severity as UiSeverity];
        const I = Icon[meta.icon];
        const active = selected === severity;
        const label = t(`severity.${severity}`);
        const content = (
          <>
            <I size={12.5} style={{ color: meta.c }} />
            <span className="tnum">{count}</span>
            {!compact && (
              <span style={{ textTransform: "uppercase", letterSpacing: "0.04em" }}>{label}</span>
            )}
          </>
        );
        const dimmed = interactive && selected != null && !active;
        if (!interactive) {
          return (
            <span key={severity} style={s.pill(meta.c, meta.bg, false, dimmed, false)}>
              {content}
            </span>
          );
        }
        return (
          <button
            key={severity}
            type="button"
            aria-pressed={active}
            aria-label={
              active
                ? t("severityFilter.pillAriaActive", { count, severity: label })
                : t("severityFilter.pillAria", { count, severity: label })
            }
            onClick={() => onSelect(severity)}
            style={s.pill(meta.c, meta.bg, active, dimmed)}
          >
            {content}
          </button>
        );
      })}
    </div>
  );
}

export default SeverityFilterBar;
