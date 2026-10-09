/* FindingCard — ported from findings.jsx (createElement → TSX).
   Severity icon+label, category, file:line, confidence, markdown rationale +
   suggestion, accept/dismiss actions. Accept/dismiss reflect persisted
   timestamps. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import {
  Icon,
  SeverityBadge,
  CategoryTag,
  MonoLink,
  ConfidenceNum,
  Button,
  Markdown,
  type Severity,
  type Category,
} from "@devdigest/ui";
import type { FindingRecord, FindingActionKind } from "@devdigest/shared";
import { SEV_COLOR, SEV_COLOR_FALLBACK } from "./constants";
import { lineLabel } from "./helpers";
import { githubBlobUrl } from "@/lib/github-urls";
import { useEvalCaseModal } from "@/components/eval-case-modal";
import { s } from "./styles";

export function FindingCard({
  f,
  focused,
  defaultExpanded,
  onAction,
  pending,
  repoFullName,
  headSha,
  onCreateEvalCase,
}: {
  f: FindingRecord;
  focused?: boolean;
  defaultExpanded?: boolean;
  onAction?: (action: FindingActionKind, reply?: string) => void;
  pending?: boolean;
  repoFullName?: string | null;
  headSha?: string | null;
  /** When provided, renders "Turn into eval case" (enabled only once decided). */
  onCreateEvalCase?: () => void;
}) {
  const t = useTranslations("prReview");
  const [expanded, setExpanded] = React.useState(defaultExpanded ?? false);
  const sevColor = SEV_COLOR[f.severity] ?? SEV_COLOR_FALLBACK;
  const fileHref =
    repoFullName && headSha
      ? githubBlobUrl(repoFullName, headSha, f.file, f.start_line, f.end_line)
      : undefined;
  const accepted = !!f.accepted_at;
  const dismissed = !!f.dismissed_at;
  const muted = accepted || dismissed;
  // Derived on every render from the persisted timestamps — never copied into state.
  const decided = accepted || dismissed;
  const evalHintId = `eval-hint-${f.id}`;
  // Saved case made from this finding (PR page only) — null/undefined elsewhere.
  const evalCase = useEvalCaseModal()?.caseForFinding(f.id);

  return (
    <div data-finding-id={f.id} style={s.card(!!focused, sevColor, muted)}>
      <div onClick={() => setExpanded((e) => !e)} style={s.header}>
        <div style={s.badgeWrap}>
          <SeverityBadge severity={f.severity as Severity} compact />
        </div>
        <div style={s.headerMain}>
          <div style={s.titleRow}>
            <span style={s.title(muted, dismissed)}>{f.title}</span>
            <CategoryTag category={f.category as Category} />
            {accepted && <span style={s.acceptedTag}>{t("finding.accepted")}</span>}
            {dismissed && <span style={s.dismissedTag}>{t("finding.dismissed")}</span>}
            {evalCase && onCreateEvalCase && (
              <span style={s.evalCaseTag} title={t("finding.evalCaseExistsTitle", { name: evalCase.name })}>
                <Icon.FlaskConical size={12} />
                {t("finding.evalCaseExists")}
              </span>
            )}
          </div>
          <div style={s.metaRow}>
            <MonoLink href={fileHref}>
              {f.file}:{lineLabel(f)}
            </MonoLink>
            <ConfidenceNum value={f.confidence} />
          </div>
        </div>
        <Icon.ChevronDown size={16} style={s.chevron(expanded)} />
      </div>

      {expanded && (
        <div style={s.body}>
          <div style={s.prose}>
            <Markdown>{f.rationale}</Markdown>
          </div>
          {f.suggestion && (
            <div style={s.suggestionWrap}>
              <div style={s.suggestionLabel}>{t("finding.suggestedFix")}</div>
              <div style={s.prose}>
                <Markdown>{f.suggestion}</Markdown>
              </div>
            </div>
          )}

          <div style={s.actions}>
            <Button
              kind="secondary"
              size="sm"
              icon="Check"
              disabled={pending}
              active={accepted}
              onClick={() => onAction?.("accept")}
            >
              {t("finding.accept")}
            </Button>
            <Button
              kind="ghost"
              size="sm"
              icon="X"
              disabled={pending}
              active={dismissed}
              onClick={() => onAction?.("dismiss")}
            >
              {t("finding.dismiss")}
            </Button>
            {onCreateEvalCase && (
              <>
                <Button
                  kind={decided ? "secondary" : "ghost"}
                  size="sm"
                  icon={evalCase ? "Check" : "FlaskConical"}
                  disabled={!decided || pending}
                  style={decided ? (evalCase ? s.evalButtonExisting : s.evalButtonReady) : undefined}
                  title={
                    !decided
                      ? t("finding.evalCaseNeedsDecision")
                      : evalCase
                        ? t("finding.evalCaseExistsTitle", { name: evalCase.name })
                        : undefined
                  }
                  aria-describedby={decided ? undefined : evalHintId}
                  onClick={() => onCreateEvalCase()}
                >
                  {evalCase ? t("finding.openEvalCase") : t("finding.turnIntoEvalCase")}
                </Button>
                {!decided && (
                  <span id={evalHintId} style={s.srOnly}>
                    {t("finding.evalCaseNeedsDecision")}
                  </span>
                )}
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}
