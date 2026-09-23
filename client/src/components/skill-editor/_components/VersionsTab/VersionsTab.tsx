/* VersionsTab — list of skill_versions (newest first), each with Restore
   (PUT body -> creates a NEW version, "git revert" semantics, never
   rewrites history) and Diff (line-level diffLines against another picked
   version). */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, SearchableSelect, Skeleton, ErrorState, Badge } from "@devdigest/ui";
import type { Skill, SkillVersion } from "@devdigest/shared";
import { useSkillVersions, useUpdateSkill } from "@/lib/hooks/skills";
import { computeLineDiff, formatVersionDate } from "./helpers";
import { s } from "./styles";

export function VersionsTab({ skill }: { skill: Skill }) {
  const t = useTranslations("skills");
  const { data: versions, isLoading, isError, refetch } = useSkillVersions(skill.id);
  const update = useUpdateSkill();
  const [diffBase, setDiffBase] = React.useState<SkillVersion | null>(null);
  const [diffWith, setDiffWith] = React.useState<number | null>(null);

  if (isLoading) {
    return (
      <div style={{ maxWidth: 720 }}>
        <Skeleton height={64} />
        <Skeleton height={64} />
      </div>
    );
  }
  if (isError || !versions) {
    return <ErrorState body={t("detail.loadError")} onRetry={() => refetch()} />;
  }
  if (versions.length === 0) {
    return <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{t("versions.empty")}</div>;
  }

  const highest = Math.max(...versions.map((v) => v.version));
  const otherVersion = diffBase ? versions.find((v) => v.version === diffWith) : null;
  const diffOptions = diffBase
    ? versions
        .filter((v) => v.version !== diffBase.version)
        .map((v) => ({ value: String(v.version), label: t("preview.version", { version: v.version }) }))
    : [];

  const restore = (v: SkillVersion) =>
    update.mutate({ id: skill.id, patch: { body: v.body } });

  return (
    <div>
      <h2 style={{ fontSize: 18, fontWeight: 700, marginBottom: 16 }}>{t("versions.title")}</h2>
      <div style={s.list}>
        {versions.map((v) => (
          <div key={v.version} style={s.row}>
            <div style={s.rowHeader}>
              <span style={s.versionLabel}>{t("preview.version", { version: v.version })}</span>
              {v.version === highest && <Badge color="var(--accent-text)">{t("versions.current")}</Badge>}
              <span style={s.date}>{formatVersionDate(v.created_at)}</span>
              <div style={s.actions}>
                <Button
                  kind="secondary"
                  size="sm"
                  icon="RefreshCw"
                  onClick={() => restore(v)}
                  disabled={update.isPending || v.version === highest}
                >
                  {update.isPending ? t("versions.restoring") : t("versions.restore")}
                </Button>
                <Button
                  kind="secondary"
                  size="sm"
                  icon="Layers"
                  onClick={() => {
                    setDiffBase(v);
                    setDiffWith(null);
                  }}
                >
                  {t("versions.diff")}
                </Button>
              </div>
            </div>
            {v.change_note && <div style={s.changeNote}>{v.change_note}</div>}

            {diffBase?.version === v.version && (
              <div style={s.diffPanel}>
                <div style={s.diffHeader}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{t("versions.diffTitle")}</span>
                  <div style={{ minWidth: 200 }}>
                    <SearchableSelect
                      value={diffWith != null ? String(diffWith) : ""}
                      onChange={(val) => setDiffWith(Number(val))}
                      options={diffOptions}
                      placeholder={t("versions.compareWith")}
                    />
                  </div>
                  <Button kind="ghost" size="sm" icon="X" onClick={() => setDiffBase(null)}>
                    {t("versions.close")}
                  </Button>
                </div>
                {otherVersion && (
                  <pre style={s.diffPre}>
                    {computeLineDiff(otherVersion.body, diffBase.body).map((part, i) => (
                      <span
                        key={i}
                        style={part.added ? s.added : part.removed ? s.removed : s.unchanged}
                      >
                        {part.value}
                      </span>
                    ))}
                  </pre>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}
