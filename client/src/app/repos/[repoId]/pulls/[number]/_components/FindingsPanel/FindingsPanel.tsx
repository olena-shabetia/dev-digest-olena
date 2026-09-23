/* FindingsPanel — hide-low-confidence + j/k navigation + FindingCard list,
   wiring the accept/dismiss action hook (A2). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Toggle, EmptyState, SeverityBadge, Icon } from "@devdigest/ui";
import type { FindingRecord, Severity } from "@devdigest/shared";
import { severityBuckets } from "@/lib/severity";
import { FindingCard } from "@/components/finding-card";
import { SeverityFilterBar } from "@/components/severity-filter-bar";
import { useFindingAction } from "../../../../../../../lib/hooks/reviews";
import { KEY_TO_ACTION } from "./constants";
import {
  confidenceFiltered,
  visibleFindings,
  scopeCounts,
  scopeFiltered,
  mostSevereOutOfScope,
} from "./helpers";
import { s } from "./styles";

export function FindingsPanel({
  findings,
  prId,
  repoFullName,
  headSha,
}: {
  findings: FindingRecord[];
  prId: string;
  repoFullName?: string | null;
  headSha?: string | null;
}) {
  const t = useTranslations("prReview");
  const action = useFindingAction();
  const [hideLow, setHideLow] = React.useState(false);
  const [severity, setSeverity] = React.useState<Severity | null>(null);
  const [focusIdx, setFocusIdx] = React.useState(0);
  const [showOutOfScope, setShowOutOfScope] = React.useState(false);

  // Counts are derived AFTER the confidence filter and BEFORE the severity
  // filter, so a pill's number always equals the number of cards its own
  // click would leave visible — see specs/L02-findings-by-severity.md.
  const byConfidence = React.useMemo(() => confidenceFiltered(findings, hideLow), [findings, hideLow]);
  const buckets = React.useMemo(() => severityBuckets(byConfidence), [byConfidence]);
  // Self-heal: if hideLow (or a dismiss/delete) makes the active severity
  // disappear, fall back to the full list rather than stranding an empty one.
  const active = buckets.some((b) => b.severity === severity) ? severity : null;
  const bySeverityFiltered = React.useMemo(
    () => visibleFindings(byConfidence, active),
    [byConfidence, active],
  );
  // Scope counts/strip are derived at this SAME stage — after severity,
  // before the scope filter itself — per client/INSIGHTS.md:43-62.
  const scope = React.useMemo(() => scopeCounts(bySeverityFiltered), [bySeverityFiltered]);
  const outOfScopeHighlight = React.useMemo(
    () => mostSevereOutOfScope(bySeverityFiltered),
    [bySeverityFiltered],
  );
  const shown = React.useMemo(
    () => scopeFiltered(bySeverityFiltered, showOutOfScope),
    [bySeverityFiltered, showOutOfScope],
  );

  React.useEffect(() => {
    setFocusIdx(0);
  }, [active, hideLow, showOutOfScope]);

  // j/k navigation + a/d shortcuts on the focused finding (keyboard).
  React.useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      const tag = (e.target as HTMLElement)?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA") return;
      if (e.key === "j") setFocusIdx((i) => Math.min(i + 1, shown.length - 1));
      else if (e.key === "k") setFocusIdx((i) => Math.max(i - 1, 0));
      else if (KEY_TO_ACTION[e.key] && shown[focusIdx]) {
        action.mutate({ findingId: shown[focusIdx]!.id, action: KEY_TO_ACTION[e.key]!, prId });
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [shown, focusIdx, action, prId]);

  return (
    <div>
      <div style={s.toolbar}>
        <SeverityFilterBar
          buckets={buckets}
          selected={active}
          onSelect={(sev) => setSeverity((prev) => (prev === sev ? null : sev))}
        />
        <div style={s.toggleGroup}>
          {t("panel.hideLowConfidence")}
          <Toggle on={hideLow} onChange={setHideLow} size={16} />
        </div>
      </div>

      {outOfScopeHighlight && (
        <div style={s.outOfScopeStrip}>
          <Icon.AlertTriangle size={14} style={{ color: "var(--warn)", flexShrink: 0 }} />
          <span style={s.outOfScopeStripLabel}>{t("panel.outOfScopeStrip")}</span>
          <span style={s.outOfScopeStripTitle}>{outOfScopeHighlight.title}</span>
          <SeverityBadge severity={outOfScopeHighlight.severity} compact />
        </div>
      )}

      <div style={s.list}>
        {shown.length === 0 ? (
          <EmptyState icon="Filter" title={t("panel.noMatchTitle")} body={t("panel.noMatchBody")} />
        ) : (
          shown.map((f, i) => (
            <FindingCard
              key={f.id}
              f={f}
              focused={i === focusIdx}
              defaultExpanded={i === 0}
              pending={action.isPending}
              repoFullName={repoFullName}
              headSha={headSha}
              onAction={(act) => action.mutate({ findingId: f.id, action: act, prId })}
            />
          ))
        )}
      </div>

      {scope.outOfScope > 0 && (
        <button
          type="button"
          style={s.scopeDisclosure}
          onClick={() => setShowOutOfScope((v) => !v)}
        >
          {showOutOfScope
            ? t("panel.scopeDisclosureHide", { count: scope.outOfScope })
            : t("panel.scopeDisclosureShow", {
                shown: scope.inScope,
                total: scope.total,
                count: scope.outOfScope,
              })}
        </button>
      )}
    </div>
  );
}
