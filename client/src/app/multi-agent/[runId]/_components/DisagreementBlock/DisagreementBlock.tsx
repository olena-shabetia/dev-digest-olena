/* DisagreementBlock — "Where agents disagree" (criteria 40-44). Renders the
   server-computed FindingGroups verbatim: no client-side grouping or
   conflict math. Hidden entirely when fewer than 2 children ran. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { EmptyState, SeverityBadge, Toggle } from "@devdigest/ui";
import type { FindingGroup } from "@devdigest/shared";
import { visibleGroups } from "./helpers";
import { s } from "./styles";

export function DisagreementBlock({
  groups,
  childrenCount,
}: {
  groups: readonly FindingGroup[];
  childrenCount: number;
}) {
  const t = useTranslations("multiAgentResults");
  const [onlyConflicts, setOnlyConflicts] = React.useState(false);

  if (childrenCount < 2) return null;

  const shown = visibleGroups(groups, onlyConflicts);

  return (
    <div style={s.root}>
      <div style={s.headerRow}>
        <span style={s.title}>{t("disagreement.title")}</span>
        <label style={s.toggleRow}>
          <span>{t("disagreement.onlyConflicts")}</span>
          <Toggle on={onlyConflicts} onChange={setOnlyConflicts} />
        </label>
      </div>

      {shown.length === 0 ? (
        <EmptyState icon="GitBranch" title={t("disagreement.empty")} />
      ) : (
        shown.map((g) => (
          <div key={g.id} style={s.group}>
            <div style={s.groupHeader}>
              <span style={s.groupLoc}>
                {g.file}:{g.start_line}
              </span>
              <span style={s.groupHeadline}>{g.headline}</span>
            </div>
            <div style={s.verdictRow}>
              {g.verdicts.map((v) => (
                <div key={v.run_id} style={s.verdictCell}>
                  <span style={s.verdictAgent}>{v.agent_name ?? t("agentFallback")}</span>
                  {v.state === "flagged" && v.severity != null ? (
                    <>
                      <SeverityBadge severity={v.severity} compact />
                      <span style={s.verdictTitle}>{v.title}</span>
                    </>
                  ) : v.state === "did_not_flag" ? (
                    <span style={s.verdictState}>
                      <span style={s.dot} />
                      {t("disagreement.didNotFlag")}
                    </span>
                  ) : (
                    <span style={s.verdictState}>
                      <span style={s.dot} />
                      {t(`status.${v.state === "cancelled" ? "cancelled" : v.state === "running" ? "running" : "failed"}`)}
                    </span>
                  )}
                </div>
              ))}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

export default DisagreementBlock;
