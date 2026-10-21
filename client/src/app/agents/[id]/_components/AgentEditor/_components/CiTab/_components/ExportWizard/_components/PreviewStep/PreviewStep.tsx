"use client";

import { useTranslations } from "next-intl";
import { Badge } from "@devdigest/ui";
import type { CiFile } from "@devdigest/shared";
import { LineNumberedEditor } from "@/components/line-numbered-editor";
import { formatBytes } from "../../helpers";
import { SHA_PREVIEW_LENGTH } from "../../constants";
import { s } from "../../styles";

export interface PreviewStepProps {
  files: CiFile[] | null;
  loading: boolean;
  workflow: string;
  onWorkflowChange: (v: string) => void;
}

/** Step 2 — the generated file tree. Only the workflow is editable. */
export function PreviewStep({ files, loading, workflow, onWorkflowChange }: PreviewStepProps) {
  const t = useTranslations("ci.exportWizard");
  if (loading && !files) return <div style={s.muted}>{t("generating")}</div>;
  if (!files) return null;
  const editable = files.find((f) => f.editable);
  return (
    <>
      <div style={s.label}>{t("filesToCreate")}</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {files.map((f) => (
          <div key={f.path} style={s.fileRow}>
            <span style={s.fileName} title={f.path}>
              {f.path}
            </span>
            {f.contents === null ? (
              <span style={s.muted}>
                {t("runnerBundleMeta", {
                  size: formatBytes(f.size_bytes),
                  sha: f.sha256.slice(0, SHA_PREVIEW_LENGTH),
                })}
              </span>
            ) : (
              <span style={s.muted}>{formatBytes(f.size_bytes)}</span>
            )}
            {f.editable && <Badge>{t("editable")}</Badge>}
          </div>
        ))}
      </div>
      {editable && (
        <LineNumberedEditor value={workflow} onChange={onWorkflowChange} filename={editable.path} />
      )}
    </>
  );
}
