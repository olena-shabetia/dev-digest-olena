/* ProjectContextView — Project Context page (L05, SPEC-03 AC-20-23),
   structured after the N6 design (`specs/DevDigest Design (standalone)
   (5).html`, `screen_tour_context.jsx`): a compact sidebar header (label +
   root glob + rescan icon) above the doc list, not a page-wide title bar —
   the crumb already carries "Project Context". Docs list on the left (path
   + type chip), the selected doc's full content on the right via the
   shared `ProjectDocPreview` (inline, no attach toggle — attaching happens
   from the Agent/Skill Context tabs, WU-12). A Rescan button just re-runs
   the listing query (Recommendation 10) — there is no separate index/embed
   step here. Deliberately has no Edit toggle, new-file, new-folder or
   upload controls, no "chunks" footer and no coverage ring (SPEC-03
   Non-goals: this page is read-only; editing project docs happens in the
   repo itself). */
"use client";

import React from "react";
import { useParams } from "next/navigation";
import { useTranslations } from "next-intl";
import { Badge, Button, EmptyState, ErrorState, Skeleton } from "@devdigest/ui";
import { AppShell } from "@/components/app-shell";
import { RepoNotFound } from "@/components/repo-not-found";
import { useActiveRepo, useRepoNotFound } from "@/lib/repo-context";
import { useProjectDocs } from "@/lib/hooks/project-context";
import { ProjectDocPreview } from "@/components/project-doc-preview";
import { ApiError } from "@/lib/api";
import { s } from "./styles";

export function ProjectContextView() {
  const t = useTranslations("context");
  const params = useParams<{ repoId: string }>();
  const repoId = params.repoId;
  const { activeRepo } = useActiveRepo();
  const repoNotFound = useRepoNotFound(repoId);

  const { data, isLoading, isError, error, refetch } = useProjectDocs(repoId);
  const [selectedPath, setSelectedPath] = React.useState<string | null>(null);

  const repoLabel = activeRepo?.full_name ?? repoId;
  const docs = data?.docs ?? [];
  const roots = (data?.roots ?? []).join(", ");
  const rescan = () => refetch();

  // Auto-select the first document once the list loads, so the page never
  // sits on an empty "select a document" state when there's something to show.
  const firstDocPath = docs[0]?.path;
  React.useEffect(() => {
    if (selectedPath == null && firstDocPath) setSelectedPath(firstDocPath);
  }, [firstDocPath, selectedPath]);

  if (repoNotFound) {
    return (
      <AppShell crumb={[{ label: repoLabel, mono: true }, { label: t("title") }]}>
        <RepoNotFound />
      </AppShell>
    );
  }

  const crumb = [{ label: repoLabel, mono: true }, { label: t("title") }];

  return (
    <AppShell crumb={crumb}>
      {isLoading ? (
        <div style={s.loadingStack}>
          <Skeleton height={140} />
          <Skeleton height={140} />
        </div>
      ) : isError ? (
        <div style={s.centerBody}>
          <ErrorState
            title={t("loadError")}
            body={error instanceof ApiError ? error.message : undefined}
            onRetry={() => refetch()}
          />
        </div>
      ) : data?.status === "not_cloned" ? (
        <div style={s.centerBody}>
          <p style={s.notCloned}>{t("notCloned")}</p>
        </div>
      ) : docs.length === 0 ? (
        <div style={s.centerBody}>
          <EmptyState
            icon="FileText"
            title={t("empty.title")}
            body={t("empty.body", { roots })}
            cta={t("rescan")}
            onCta={rescan}
          />
          <p style={s.rootsHint}>{t("rootsHint", { roots })}</p>
        </div>
      ) : (
        <div style={s.split}>
          <aside style={s.sidebar}>
            <div style={s.sidebarHeader}>
              <div style={s.sidebarLabel}>{t("title")}</div>
              <div style={s.sidebarSubtitle}>{roots}</div>
              <div style={s.sidebarActions}>
                <Button
                  kind="ghost"
                  size="sm"
                  icon="RefreshCw"
                  aria-label={t("rescan")}
                  title={t("rescan")}
                  onClick={rescan}
                  disabled={isLoading}
                />
              </div>
            </div>
            <div style={s.list} role="listbox" aria-label={t("title")}>
              {docs.map((doc) => (
                <button
                  key={doc.path}
                  type="button"
                  role="option"
                  aria-selected={selectedPath === doc.path}
                  style={s.row(selectedPath === doc.path)}
                  onClick={() => setSelectedPath(doc.path)}
                >
                  <span style={s.rowPath}>{doc.path}</span>
                  {doc.type && <Badge>{doc.type}</Badge>}
                </button>
              ))}
            </div>
            <div style={s.sidebarFooter}>
              <span style={s.sidebarFooterDot} />
              {t("indexedFiles", { count: docs.length })}
            </div>
          </aside>
          <main style={s.main}>
            {selectedPath ? (
              <ProjectDocPreview repoId={repoId} path={selectedPath} />
            ) : (
              <p style={s.selectDoc}>{t("selectDoc")}</p>
            )}
          </main>
        </div>
      )}
    </AppShell>
  );
}
