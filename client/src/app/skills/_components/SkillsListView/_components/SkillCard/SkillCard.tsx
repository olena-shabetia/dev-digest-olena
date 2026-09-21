/* SkillCard — one row in the /skills left rail: type-coloured icon, name,
   description, type badge, source badge (+ a "needs vetting" flag for a
   disabled, untrusted skill), and an enabled Toggle. No per-card "N agents" /
   pull-rate / accept-rate — see SkillsListView.tsx's header comment: those
   numbers need a per-run skill-attribution table that doesn't exist, so
   they're only shown (the "N agents" part, which IS real) in SkillEditor's
   StatsTab rather than faked here. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, Badge, Toggle } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { typeColor } from "./helpers";
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
  const needsVetting = skill.source !== "manual" && !skill.enabled;
  return (
    <div onClick={onClick} style={s.card(!!active, skill.enabled)}>
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
      </div>
      <div style={s.description}>{skill.description || t("file.noDescription")}</div>
      <div style={s.metaRow}>
        <Badge>{t(`listItem.type.${skill.type}`)}</Badge>
        <Badge color="var(--text-secondary)">{t(`listItem.source.${skill.source}`)}</Badge>
        {needsVetting && (
          <span title={t("listItem.vettingTitle")}>
            <Badge color="var(--warn)" icon="AlertTriangle">
              {t("listItem.needsVetting")}
            </Badge>
          </span>
        )}
      </div>
    </div>
  );
}
