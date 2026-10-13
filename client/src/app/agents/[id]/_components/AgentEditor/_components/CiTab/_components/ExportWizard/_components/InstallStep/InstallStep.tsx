"use client";

import { useTranslations } from "next-intl";
import type { CiExport } from "@devdigest/shared";
import { safeHttpUrl } from "@/lib/github-urls";
import type { InstallAction } from "../../constants";
import { s } from "../../styles";

export interface InstallStepProps {
  repo: string;
  fileCount: number;
  conflictAgentName: string | null;
  action: InstallAction;
  onAction: (a: InstallAction) => void;
  result: CiExport | undefined;
  errorMessage: string | null;
}

/** Step 4 — choose PR vs zip, then show the outcome or GitHub's error. */
export function InstallStep(p: InstallStepProps) {
  const t = useTranslations("ci.exportWizard");
  const prUrl = p.result?.action === "open_pr" ? safeHttpUrl(p.result.pr_url) : undefined;
  const done = p.result !== undefined;
  return (
    <>
      <label style={p.action === "open_pr" ? s.cardActive : { ...s.card, cursor: "pointer" }}>
        <span style={s.radioRow}>
          <input
            type="radio"
            name="ci-action"
            checked={p.action === "open_pr"}
            disabled={done}
            onChange={() => p.onAction("open_pr")}
          />
          <span style={s.cardTitle}>{t("installCardTitle")}</span>
        </span>
        <span style={s.cardBody}>{t("installCardBody", { repo: p.repo, count: p.fileCount })}</span>
      </label>
      <label style={p.action === "files" ? s.cardActive : { ...s.card, cursor: "pointer" }}>
        <span style={s.radioRow}>
          <input
            type="radio"
            name="ci-action"
            checked={p.action === "files"}
            disabled={done}
            onChange={() => p.onAction("files")}
          />
          <span style={s.cardTitle}>{t("zipCardTitle")}</span>
        </span>
        <span style={s.cardBody}>{t("zipCardHint")}</span>
      </label>
      {p.conflictAgentName && (
        <div role="alert" style={s.errorBox}>
          {t("conflict", { repo: p.repo, agent: p.conflictAgentName })}
        </div>
      )}
      {p.errorMessage && (
        <div role="alert" style={s.errorBox}>
          {t("installFailed", { message: p.errorMessage })}
        </div>
      )}
      {p.result?.action === "open_pr" && (
        <div style={s.infoBox}>
          <div style={s.cardTitle}>{t("prReady")}</div>
          {prUrl && (
            <a href={prUrl} target="_blank" rel="noreferrer" style={s.link}>
              {t("viewPr")}
            </a>
          )}
        </div>
      )}
      {p.result?.action === "files" && <div style={s.infoBox}>{t("zipDone")}</div>}
    </>
  );
}
