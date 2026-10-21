"use client";

import { useTranslations } from "next-intl";
import type { CiPostAs, CiTrigger } from "@devdigest/shared";
import { POST_AS_OPTIONS, SECRET_ROWS, TRIGGER_VALUES } from "../../constants";
import { s } from "../../styles";

export interface ConfigureStepProps {
  triggers: CiTrigger[];
  onToggleTrigger: (tr: CiTrigger) => void;
  postAs: CiPostAs;
  onPostAs: (v: CiPostAs) => void;
}

/** Step 3 — triggers, post mode, static secrets text, merge-gate info. */
export function ConfigureStep({ triggers, onToggleTrigger, postAs, onPostAs }: ConfigureStepProps) {
  const t = useTranslations("ci.exportWizard");
  return (
    <>
      <div>
        <div style={s.label}>{t("triggerLabel")}</div>
        <div style={{ ...s.chips, marginTop: 8 }}>
          {TRIGGER_VALUES.map((tr) => (
            <label key={tr} style={s.radioRow}>
              <input type="checkbox" checked={triggers.includes(tr)} onChange={() => onToggleTrigger(tr)} />
              <span style={s.mono}>{t(`triggerChip.${tr}`)}</span>
            </label>
          ))}
        </div>
        {triggers.length === 0 && (
          <div role="alert" style={{ ...s.muted, color: "var(--crit)", marginTop: 6 }}>
            {t("triggerRequired")}
          </div>
        )}
      </div>
      <div>
        <div style={s.label}>{t("postResultsLabel")}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8, marginTop: 8 }}>
          {POST_AS_OPTIONS.map((o) => (
            <label key={o.value} style={s.radioRow}>
              <input
                type="radio"
                name="ci-post-as"
                checked={postAs === o.value}
                onChange={() => onPostAs(o.value)}
              />
              {t(`postAs.${o.labelKey}`)}
            </label>
          ))}
        </div>
      </div>
      <div>
        <div style={s.label}>{t("secretsLabel")}</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginTop: 8 }}>
          {SECRET_ROWS.map((r) => (
            <div key={r.name} style={s.fileRow}>
              <span style={s.fileName}>{r.name}</span>
              <span style={s.muted}>{t(r.descKey)}</span>
            </div>
          ))}
        </div>
      </div>
      <div style={s.infoBox}>
        <strong>{t("blockMergeTitle")}</strong>
        <div>{t("blockMergeInfo")}</div>
      </div>
    </>
  );
}
