/* ProjectDocPreview — full content of one project-context document (path,
   type chip, usage count, token estimate, optional attach/detach toggle),
   rendered through the shared `Markdown` primitive. Fetches via
   `useProjectDoc(repoId, path)`; on error it shows a retry state with no
   partial content, so an attacker-controlled doc body is never rendered
   half-loaded. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Badge, Button, Icon, Markdown, Skeleton, ErrorState } from "@devdigest/ui";
import { useProjectDoc } from "@/lib/hooks/project-context";
import { s } from "./styles";

export interface ProjectDocPreviewProps {
  repoId: string;
  path: string;
  attachToggle?: { attached: boolean; onToggle: () => void };
}

export function ProjectDocPreview({ repoId, path, attachToggle }: ProjectDocPreviewProps) {
  const t = useTranslations("projectDocs.preview");
  const { data, isLoading, isError, refetch } = useProjectDoc(repoId, path);
  const [viewMode, setViewMode] = React.useState<"preview" | "raw">("preview");

  // A new doc may be selected without unmounting this component — start each
  // one back on the rendered view rather than carrying over the previous
  // doc's raw/preview choice.
  React.useEffect(() => {
    setViewMode("preview");
  }, [repoId, path]);

  if (isLoading) {
    return (
      <div style={s.wrap}>
        <Skeleton height={18} width={280} />
        <Skeleton height={120} />
      </div>
    );
  }

  if (isError || !data) {
    return <ErrorState body={t("loadError")} onRetry={() => refetch()} />;
  }

  return (
    <div style={s.wrap}>
      <div style={s.header}>
        <div style={s.headerTop}>
          <span style={s.path}>{data.path}</span>
          <div style={s.viewToggle}>
            <button
              type="button"
              style={s.viewToggleBtn(viewMode === "preview")}
              onClick={() => setViewMode("preview")}
            >
              {t("viewPreview")}
            </button>
            <button
              type="button"
              style={s.viewToggleBtn(viewMode === "raw")}
              onClick={() => setViewMode("raw")}
            >
              {t("viewRaw")}
            </button>
          </div>
          <span style={s.usedBy}>
            <Icon.Cpu size={13} />
            {t("usedBy", { count: data.used_by_agents ?? 0 })}
          </span>
        </div>
        <div style={s.metaRow}>
          {data.type && <Badge>{data.type}</Badge>}
          {data.tokens != null && <span style={s.metaText}>{t("tokens", { count: data.tokens })}</span>}
          {data.truncated && <span style={s.metaText}>{t("truncated")}</span>}
          {attachToggle && (
            <Button
              kind={attachToggle.attached ? "secondary" : "primary"}
              size="sm"
              onClick={attachToggle.onToggle}
            >
              {attachToggle.attached ? t("detach") : t("attach")}
            </Button>
          )}
        </div>
      </div>
      <div style={s.body}>
        {viewMode === "raw" ? <pre style={s.raw}>{data.content}</pre> : <Markdown>{data.content}</Markdown>}
      </div>
    </div>
  );
}
