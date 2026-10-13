"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import { s } from "../../styles";

/** Step 1 — one preselected GitHub Actions card + the active repo, read-only. */
export function TargetStep({ repo }: { repo: string }) {
  const t = useTranslations("ci.exportWizard");
  return (
    <>
      <div style={s.cardActive}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <span style={s.cardTitle}>{t("targets.gha")}</span>
          <Badge color="var(--ok)">{t("recommended")}</Badge>
        </div>
        <span style={s.cardBody}>{t("targets.ghaDesc")}</span>
      </div>
      <div>
        <div style={s.label}>{t("repoLabel")}</div>
        <div style={{ ...s.mono, marginTop: 6 }} data-testid="wizard-repo">
          {repo}
        </div>
        <div style={{ ...s.muted, marginTop: 4 }}>{t("repoHint")}</div>
      </div>
    </>
  );
}
