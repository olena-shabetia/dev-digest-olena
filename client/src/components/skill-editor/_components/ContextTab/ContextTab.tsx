/* ContextTab (Skill) — L05: attach this repo's project-context documents to
   this skill. Any agent using the skill (enabled) inherits these documents
   into its own effective set (`resolveEffectiveDocPaths`, server-side).
   Adds a read-only "Serializes as" preview of the `## Project context`
   block these paths produce, in attached order (OQ-10 default). Mirrors the
   Agent ContextTab's optimistic attach/rollback shape. */
"use client";

import React from "react";
import type { CSSProperties } from "react";
import { useTranslations } from "next-intl";
import type { Skill } from "@devdigest/shared";
import { Badge } from "@devdigest/ui";
import { ProjectDocPicker } from "@/components/project-doc-picker";
import { ProjectDocPreviewDrawer } from "@/components/project-doc-preview";
import { useActiveRepo } from "@/lib/repo-context";
import { useSkillContextDocs, useSetSkillContextDocs } from "@/lib/hooks/project-context";
import { useToast } from "@/lib/toast";

const s = {
  wrap: { display: "flex", flexDirection: "column", gap: 16 } satisfies CSSProperties,
  header: { display: "flex", flexDirection: "column", gap: 4 } satisfies CSSProperties,
  headerRow: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  h2: { fontSize: 16, fontWeight: 700 } satisfies CSSProperties,
  badge: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  helper: { fontSize: 12, color: "var(--text-muted)", lineHeight: 1.45, margin: 0 } satisfies CSSProperties,
  serializesHeading: { fontSize: 13, fontWeight: 600, margin: 0 } satisfies CSSProperties,
  pre: {
    fontFamily: "var(--font-mono, monospace)",
    fontSize: 12,
    whiteSpace: "pre-wrap",
    background: "var(--bg-elevated)",
    border: "1px solid var(--border)",
    borderRadius: 8,
    padding: 12,
    margin: "6px 0 0",
  } satisfies CSSProperties,
};

export function ContextTab({ skill }: { skill: Skill }) {
  const t = useTranslations("contextTabs.skill");
  const toast = useToast();
  const { repoId } = useActiveRepo();

  const { data: linked } = useSkillContextDocs(skill.id, repoId);
  const setDocs = useSetSkillContextDocs(skill.id);

  const [attached, setAttached] = React.useState<string[]>([]);
  const [previewPath, setPreviewPath] = React.useState<string | null>(null);

  // Re-seed local state from the server set whenever it (or the active repo)
  // changes — AC-2b.
  React.useEffect(() => {
    setAttached(linked?.paths ?? []);
  }, [linked, repoId]);

  const onChange = (next: string[]) => {
    if (!repoId) return;
    const prev = attached;
    setAttached(next);
    setDocs.mutate(
      { repoId, paths: next },
      {
        onError: () => {
          setAttached(prev);
          toast.error(t("saveError"));
        },
      },
    );
  };

  const toggleAttach = (path: string) => {
    onChange(attached.includes(path) ? attached.filter((p) => p !== path) : [...attached, path]);
  };

  const serialized = attached.length > 0 ? ["## Project context", ...attached.map((p) => `- ${p}`)].join("\n") : null;

  return (
    <div style={s.wrap}>
      <ProjectDocPicker
        repoId={repoId}
        attached={attached}
        onChange={onChange}
        disabled={setDocs.isPending}
        onPreview={setPreviewPath}
        contextPageHref={repoId ? `/repos/${repoId}/context` : null}
        header={
          <div style={s.header}>
            <div style={s.headerRow}>
              <h2 style={s.h2}>{t("heading")}</h2>
              <Badge color="var(--accent-text)" bg="var(--accent-bg)">
                {t("badge", { count: attached.length })}
              </Badge>
            </div>
            <p style={s.helper}>{t("helper")}</p>
          </div>
        }
      />
      {serialized && (
        <div>
          <h3 style={s.serializesHeading}>{t("serializesAs")}</h3>
          <pre style={s.pre}>{serialized}</pre>
        </div>
      )}
      {repoId && previewPath && (
        <ProjectDocPreviewDrawer
          open
          onClose={() => setPreviewPath(null)}
          repoId={repoId}
          path={previewPath}
          attachToggle={{
            attached: attached.includes(previewPath),
            onToggle: () => toggleAttach(previewPath),
          }}
        />
      )}
    </div>
  );
}
