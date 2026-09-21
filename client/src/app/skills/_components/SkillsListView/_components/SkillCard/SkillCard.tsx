/* SkillCard — one row in the /skills left rail: type-coloured icon, name,
   description, "Manual · v{version}" meta line, type/vetting badges, an
   "⚙ N agents" badge + "pull freq · accept" pair (HW2 criteria 22-24, from
   `GET /skills`'s list-only usage aggregates), an enabled Toggle, and a
   Delete button (wired to the shared ConfirmDialog — client/INSIGHTS.md's
   "promote on second consumer" rule, same dialog AgentCard uses). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { ConfirmDialog } from "../../../../../../components/confirm-dialog";
import { useDeleteSkill } from "../../../../../../lib/hooks/skills";
import { typeColor, formatPercent } from "./helpers";
import { s } from "./styles";

export function SkillCard({
  skill,
  active,
  onClick,
  onToggle,
}: {
  skill: Skill;
  active?: boolean;
  onClick?: () => void;
  onToggle?: (enabled: boolean) => void;
}) {
  const t = useTranslations("skills");
  const del = useDeleteSkill();
  const [confirming, setConfirming] = React.useState(false);
  const needsVetting = skill.source !== "manual" && !skill.enabled;

  return (
    <div onClick={onClick} style={s.card(!!active, skill.enabled)}>
      {confirming && (
        <div onClick={(e) => e.stopPropagation()}>
          <ConfirmDialog
            title={t("card.deleteTitle")}
            body={t("card.deleteBody", { name: skill.name })}
            confirmLabel={t("card.deleteConfirm")}
            loading={del.isPending}
            onConfirm={() => del.mutate(skill.id, { onSuccess: () => setConfirming(false) })}
            onClose={() => setConfirming(false)}
          />
        </div>
      )}
      <div style={s.headerRow}>
        <div style={s.iconBox(typeColor(skill.type))}>
          <Icon.Sparkles size={13} />
        </div>
        <span style={s.name}>{skill.name}</span>
        {onToggle && (
          <div onClick={(e) => e.stopPropagation()}>
            <Toggle on={skill.enabled} onChange={onToggle} size={14} />
          </div>
        )}
        <button
          onClick={(e) => {
            e.stopPropagation();
            setConfirming(true);
          }}
          disabled={del.isPending}
          title={t("card.deleteTitle")}
          aria-label={t("card.deleteTitle")}
          style={s.deleteBtn}
        >
          <Icon.Trash size={14} style={del.isPending ? { animation: "ddspin 1s linear infinite" } : undefined} />
        </button>
      </div>
      <div style={s.description}>{skill.description || t("file.noDescription")}</div>
      <div style={s.versionLine}>{t("card.versionLine", { source: t(`listItem.source.${skill.source}`), version: skill.version })}</div>
      <div style={s.metaRow}>
        <Badge>{t(`listItem.type.${skill.type}`)}</Badge>
        {needsVetting && (
          <span title={t("listItem.vettingTitle")}>
            <Badge color="var(--warn)" icon="AlertTriangle">
              {t("listItem.needsVetting")}
            </Badge>
          </span>
        )}
      </div>
      <div style={s.statsRow}>
        {skill.agent_count != null && (
          <Badge color="var(--text-secondary)" icon="Cpu">
            {t("card.agentCount", { count: skill.agent_count })}
          </Badge>
        )}
        {(skill.pull_freq != null || skill.accept_rate != null) && (
          <span style={s.usagePair}>
            {t("card.usagePair", {
              pull: formatPercent(skill.pull_freq ?? null),
              accept: formatPercent(skill.accept_rate ?? null),
            })}
          </span>
        )}
      </div>
    </div>
  );
}
