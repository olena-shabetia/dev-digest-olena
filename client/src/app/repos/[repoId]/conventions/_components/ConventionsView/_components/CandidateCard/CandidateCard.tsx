/* CandidateCard — one merged house-rule proposal. Click the card body (not a
   button) to edit inline: rule becomes a textarea + category becomes a
   select, with Save/Cancel beneath; the evidence block and Accept/Reject
   column stay visible and functional the whole time (plan "Design decisions"
   — criterion 47 wants Accept/Reject/Edit all present, Edit just isn't a
   button). Accept becomes the static badge "✓ Accepted" once accepted, and
   symmetrically Reject becomes the static badge "✗ Rejected" once rejected —
   whichever action WASN'T taken stays a live button, so a decision is
   reversible in both directions (a rejected candidate can still be
   re-Accepted, and vice versa) without either state hiding the card. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, SelectInput, Textarea, PercentProgress } from "@devdigest/ui";
import type { ConventionCandidate, ConventionCategory } from "@devdigest/shared";
import { alsoSeenIn } from "./helpers";
import { CATEGORY_VALUES } from "./constants";
import { s } from "./styles";

export function CandidateCard({
  candidate,
  onAccept,
  onReject,
  onSave,
  saving,
}: {
  candidate: ConventionCandidate;
  onAccept: () => void;
  onReject: () => void;
  onSave: (patch: { rule: string; category: ConventionCategory }) => void;
  saving?: boolean;
}) {
  const t = useTranslations("conventions");
  const [editing, setEditing] = React.useState(false);
  const [rule, setRule] = React.useState(candidate.rule);
  const [category, setCategory] = React.useState<ConventionCategory>(candidate.category);

  // A patch (ours or a re-scan preserving the row) can update the candidate
  // out from under an open, non-edited card — reset the local draft to match.
  React.useEffect(() => {
    if (!editing) {
      setRule(candidate.rule);
      setCategory(candidate.category);
    }
  }, [candidate.id, candidate.rule, candidate.category, editing]);

  const rejected = candidate.status === "rejected";
  const accepted = candidate.status === "accepted";
  const also = alsoSeenIn(candidate.evidences);

  const openEdit = () => {
    if (!editing) setEditing(true);
  };
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  const cancelEdit = (e: React.SyntheticEvent) => {
    stop(e);
    setRule(candidate.rule);
    setCategory(candidate.category);
    setEditing(false);
  };
  const saveEdit = (e: React.SyntheticEvent) => {
    stop(e);
    if (!rule.trim()) return;
    onSave({ rule: rule.trim(), category });
    setEditing(false);
  };

  const categoryOptions = CATEGORY_VALUES.map((c) => ({ value: c, label: t(`category.${c}`) }));

  return (
    <div style={s.card(rejected)}>
      <div style={s.body} onClick={openEdit} title={editing ? undefined : t("card.editHint")}>
        {editing ? (
          <div onClick={stop}>
            <Textarea value={rule} onChange={setRule} rows={3} />
            <div style={{ marginTop: 8 }}>
              <SelectInput value={category} onChange={(v) => setCategory(v as ConventionCategory)} options={categoryOptions} />
            </div>
            <div style={s.editActions}>
              <Button kind="ghost" size="sm" onClick={cancelEdit}>
                {t("card.cancel")}
              </Button>
              <Button kind="primary" size="sm" onClick={saveEdit} disabled={!rule.trim()}>
                {t("card.save")}
              </Button>
            </div>
          </div>
        ) : (
          <>
            <div style={s.ruleRow}>
              <em style={s.rule}>{candidate.rule}</em>
              <Badge>{t(`category.${candidate.category}`)}</Badge>
              {candidate.edited && <Badge color="var(--text-muted)">{t("card.editedBadge")}</Badge>}
            </div>
            <div style={s.evidenceRow}>
              <span className="mono" style={s.evidencePath}>
                {candidate.evidence_path}:{candidate.evidence_line ?? "?"}
              </span>
              {candidate.evidence_url && (
                <a
                  href={candidate.evidence_url}
                  target="_blank"
                  rel="noreferrer"
                  onClick={stop}
                  style={s.githubLink}
                >
                  {t("card.github")}
                </a>
              )}
            </div>
            {candidate.evidence_snippet && <pre className="mono" style={s.snippet}>{candidate.evidence_snippet}</pre>}
            {also && (
              <div style={s.alsoSeenIn}>
                {t("card.alsoSeenInLabel")}: {also.shown.join(" · ")}
                {also.remaining > 0 ? ` · ${t("card.moreCount", { count: also.remaining })}` : ""}
              </div>
            )}
            <div style={s.confidenceRow}>
              <PercentProgress value={candidate.confidence * 100} label={t("card.confidence")} />
            </div>
          </>
        )}
      </div>
      <div style={s.actions} onClick={stop}>
        {accepted ? (
          <Badge color="var(--ok)" icon="Check">
            {t("card.accepted")}
          </Badge>
        ) : (
          <Button kind="primary" size="sm" icon="Check" onClick={onAccept} disabled={saving}>
            {saving ? t("card.accepting") : t("card.accept")}
          </Button>
        )}
        {rejected ? (
          <Badge color="var(--crit)" icon="X">
            {t("card.rejected")}
          </Badge>
        ) : (
          <Button kind="ghost" size="sm" icon="X" onClick={onReject} disabled={saving}>
            {t("card.reject")}
          </Button>
        )}
      </div>
    </div>
  );
}
