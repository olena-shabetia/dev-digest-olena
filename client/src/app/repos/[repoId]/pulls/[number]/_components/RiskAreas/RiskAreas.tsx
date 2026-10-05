/* RiskAreas — the model's risks, rendered inside IntentCard's children slot.
   All model text is rendered as plain text (never Markdown/HTML). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { SectionLabel, Icon, SEV } from "@devdigest/ui";
import type { Risk } from "@devdigest/shared";
import { RISK_KIND_ICON, RISK_KIND_FALLBACK_ICON, RISK_SEVERITY_TOKEN } from "./constants";
import { parseRef, truncateMiddle } from "./helpers";
import { s } from "./styles";

function RiskRow({
  risk,
  knownPaths,
  onOpenFile,
}: {
  risk: Risk;
  knownPaths: ReadonlySet<string>;
  onOpenFile: (file: string, line: number | null) => void;
}) {
  const t = useTranslations("brief");
  const [open, setOpen] = React.useState(false);
  const sevToken = SEV[RISK_SEVERITY_TOKEN[risk.severity]];
  const KindIcon = Icon[RISK_KIND_ICON[risk.kind] ?? RISK_KIND_FALLBACK_ICON];
  const Chevron = open ? Icon.ChevronUp : Icon.ChevronDown;
  const explanationId = React.useId();

  return (
    <div style={s.row}>
      <div style={s.rowHead}>
        <div style={s.rowMain}>
          <span style={s.titleLine}>
            <span style={s.kindIcon(sevToken.c)}>
              <KindIcon size={14} />
            </span>
            <span style={s.srOnly}>{t(`severity.${risk.severity}`)}</span>
            <span>{risk.title}</span>
          </span>
          {risk.file_refs.length > 0 && (
            <span style={s.refs}>
              {risk.file_refs.map((ref, i) => {
                const { path, line } = parseRef(ref);
                return knownPaths.has(path) ? (
                  <button
                    key={`${ref}-${i}`}
                    type="button"
                    style={s.refLink}
                    title={ref}
                    onClick={() => onOpenFile(path, line)}
                  >
                    {truncateMiddle(ref)}
                  </button>
                ) : (
                  <span key={`${ref}-${i}`} style={s.refText} title={ref}>
                    {truncateMiddle(ref)} · {t("fileNotInDiff")}
                  </span>
                );
              })}
            </span>
          )}
        </div>
        <button
          type="button"
          style={s.chevron}
          aria-expanded={open}
          aria-controls={explanationId}
          aria-label={open ? t("collapseRisk") : t("expandRisk")}
          onClick={() => setOpen((o) => !o)}
        >
          <Chevron size={14} />
        </button>
      </div>
      {open && (
        <p id={explanationId} style={s.explanation}>
          {risk.explanation}
        </p>
      )}
    </div>
  );
}

export function RiskAreas({
  risks,
  knownPaths,
  onOpenFile,
}: {
  risks: Risk[] | null;
  knownPaths: ReadonlySet<string>;
  onOpenFile: (file: string, line: number | null) => void;
}) {
  const t = useTranslations("brief");
  if (risks == null) return null;
  return (
    <div style={s.wrap}>
      <SectionLabel icon="AlertTriangle">{t("block.risks")}</SectionLabel>
      {risks.length === 0 ? (
        <span style={s.empty}>{t("noRisks")}</span>
      ) : (
        <div style={s.list}>
          {risks.map((risk, i) => (
            <RiskRow key={`${risk.title}-${i}`} risk={risk} knownPaths={knownPaths} onOpenFile={onOpenFile} />
          ))}
        </div>
      )}
    </div>
  );
}
