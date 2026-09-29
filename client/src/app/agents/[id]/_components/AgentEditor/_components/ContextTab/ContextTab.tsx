/* ContextTab (Agent) — L05: attach this repo's project-context documents
   (specs/docs/insights) to this agent. Reuses the shared `ProjectDocPicker`
   (list + drag/filter/footer) and `ProjectDocPreviewDrawer` (full-content
   preview with an attach toggle). The active repo comes from
   `useActiveRepo()`; there is no repo selector here.

   Local `attached` is optimistic: seeded from the server set on load/repo
   switch, updated immediately on toggle/reorder, and rolled back on a
   mutation error (same shape as SkillsTab's `commit`). */
"use client";

import React from "react";
import type { CSSProperties } from "react";
import { useTranslations } from "next-intl";
import type { Agent } from "@devdigest/shared";
import { ProjectDocPicker } from "@/components/project-doc-picker";
import { ProjectDocPreviewDrawer } from "@/components/project-doc-preview";
import { useActiveRepo } from "@/lib/repo-context";
import { useProjectDocs, useAgentContextDocs, useSetAgentContextDocs } from "@/lib/hooks/project-context";
import { useToast } from "@/lib/toast";

const s = {
  header: { display: "flex", flexDirection: "column", gap: 4 } satisfies CSSProperties,
  headerRow: { display: "flex", alignItems: "center", gap: 10 } satisfies CSSProperties,
  h2: { fontSize: 16, fontWeight: 700 } satisfies CSSProperties,
  badge: { fontSize: 13, color: "var(--text-muted)" } satisfies CSSProperties,
  helper: { fontSize: 12, color: "var(--text-muted)", lineHeight: 1.45, margin: 0 } satisfies CSSProperties,
};

export function ContextTab({ agent }: { agent: Agent }) {
  const t = useTranslations("contextTabs.agent");
  const toast = useToast();
  const { repoId } = useActiveRepo();

  const { data: listing } = useProjectDocs(repoId);
  const { data: linked } = useAgentContextDocs(agent.id, repoId);
  const setDocs = useSetAgentContextDocs(agent.id);

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

  const total = listing?.docs.length ?? 0;

  return (
    <>
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
              <span style={s.badge}>{t("badge", { attached: attached.length, total })}</span>
            </div>
            <p style={s.helper}>{t("helper")}</p>
          </div>
        }
      />
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
    </>
  );
}
