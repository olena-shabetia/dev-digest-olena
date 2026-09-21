/* StatsTab (skill editor) — real-data-only, a narrower cut than AgentStats:
   nothing records which skill was active on a given run, so pull frequency /
   accept rate / findings (30D) / the findings-by-category donut can't be
   computed at all. Renders only what's real: a "Used by N agents" count and
   the list of agents using this skill, each with an Open link. See
   specs/L02-skills.ui.md's "StatsTab" section. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import Link from "next/link";
import { Skeleton, ErrorState, Icon } from "@devdigest/ui";
import type { Skill } from "@devdigest/shared";
import { useSkillStats } from "../../../../../../lib/hooks/skills";
import { s } from "./styles";

export function StatsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const { data: stats, isLoading, isError, refetch } = useSkillStats(skill.id);

  if (isLoading) {
    return (
      <div style={{ maxWidth: 480 }}>
        <Skeleton height={64} />
        <Skeleton height={120} />
      </div>
    );
  }
  if (isError || !stats) {
    return <ErrorState body={t("page.loadError")} onRetry={() => refetch()} />;
  }

  return (
    <div style={{ maxWidth: 480 }}>
      <div style={s.tile}>
        <Icon.Users size={18} style={{ color: "var(--accent)" }} />
        <span style={s.tileCount}>{t("stats.usedBy", { count: stats.agents_using.length })}</span>
      </div>
      <h3 style={{ fontSize: 14, fontWeight: 700, marginBottom: 10 }}>{t("stats.agentsUsing")}</h3>
      {stats.agents_using.length === 0 ? (
        <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{t("stats.empty")}</div>
      ) : (
        <div style={s.list}>
          {stats.agents_using.map((a) => (
            <div key={a.id} style={s.row}>
              <span style={s.rowName}>{a.name}</span>
              <Link href={`/agents/${a.id}`} style={{ fontSize: 13, color: "var(--accent-text)" }}>
                {t("stats.open")}
              </Link>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
