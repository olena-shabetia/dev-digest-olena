/* ImportSkillDrawer — two-step import: pick a file, preview it (server
   parses, nothing saved yet), then confirm to actually create the skill.

   Scope: only the "From file" tab is functional (per plan Part 2 — URL and
   community import are out of scope for this lesson). Rather than render
   `url`/`community` as disabled tabs (the Tabs primitive has no disabled
   affordance), this drawer simply doesn't render them at all — the
   `drawer.tabs.url`/`drawer.tabs.community` copy stays unused, same as the
   dropdown's `fromUrl`/`community` menu items elsewhere in this feature. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Button, Drawer, Badge } from "@devdigest/ui";
import { LineNumberedEditor } from "../../../../../../components/line-numbered-editor";
import { useImportSkillPreview, useCreateSkill } from "../../../../../../lib/hooks/skills";
import { useToast } from "../../../../../../lib/toast";
import { ApiError } from "../../../../../../lib/api";
import { ACCEPT, DRAWER_WIDTH } from "./constants";
import { s } from "./styles";

export function ImportSkillDrawer({
  onClose,
  onImported,
}: {
  onClose: () => void;
  onImported: (id: string) => void;
}) {
  const t = useTranslations("skills");
  const toast = useToast();
  const previewMut = useImportSkillPreview();
  const createMut = useCreateSkill();
  const [fileName, setFileName] = React.useState<string | null>(null);
  const [error, setError] = React.useState<string | null>(null);

  const handleFile = async (file: File) => {
    setFileName(file.name);
    setError(null);
    previewMut.reset();
    try {
      await previewMut.mutateAsync(file);
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("drawer.importFailed"));
    }
  };

  const confirm = async () => {
    const preview = previewMut.data;
    if (!preview) return;
    try {
      const skill = await createMut.mutateAsync({
        name: preview.name,
        description: preview.description,
        type: preview.type,
        body: preview.body,
        source: "imported_url",
        enabled: false,
      });
      toast.success(t("file.success", { name: skill.name }));
      onImported(skill.id);
      onClose();
    } catch (e) {
      setError(e instanceof ApiError ? e.message : t("drawer.importFailed"));
    }
  };

  const preview = previewMut.data;

  return (
    <Drawer
      width={DRAWER_WIDTH}
      title={t("drawer.title")}
      subtitle={t("drawer.subtitle")}
      onClose={onClose}
      footer={
        <div style={s.footer}>
          <Button kind="ghost" onClick={onClose}>
            {t("create.cancel")}
          </Button>
          <Button kind="primary" icon="Upload" onClick={confirm} disabled={!preview || createMut.isPending}>
            {createMut.isPending ? t("file.importing") : t("file.import")}
          </Button>
        </div>
      }
    >
      <div style={s.section}>
        <div style={{ fontSize: 13, fontWeight: 600, marginBottom: 8 }}>{t("drawer.tabs.file")}</div>
        <label style={s.fileRow}>
          <input
            type="file"
            accept={ACCEPT}
            style={{ flex: 1 }}
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) handleFile(f);
            }}
          />
        </label>
        {!fileName && <div style={{ fontSize: 12, color: "var(--text-muted)", marginTop: 6 }}>{t("file.chooseFile")}</div>}
      </div>

      {previewMut.isPending && <div style={{ fontSize: 13, color: "var(--text-secondary)" }}>{t("file.importing")}</div>}
      {error && <div style={s.error}>{error}</div>}

      {preview && (
        <div style={s.previewCard}>
          <div style={{ fontSize: 13, fontWeight: 700 }}>{t("file.previewTitle")}</div>
          <div style={s.previewRow}>
            <span style={s.previewLabel}>{t("file.previewName")}</span>
            <span style={s.previewValue}>{preview.name}</span>
          </div>
          <div style={s.previewRow}>
            <span style={s.previewLabel}>{t("file.previewDescription")}</span>
            <span style={s.previewValue}>{preview.description || t("file.noDescription")}</span>
          </div>
          <div style={s.previewRow}>
            <span style={s.previewLabel}>{t("file.previewType")}</span>
            <Badge>{t(`listItem.type.${preview.type}`)}</Badge>
          </div>
          <div>
            <div style={{ ...s.previewLabel, marginBottom: 6 }}>{t("file.previewBody")}</div>
            <div style={s.bodyBox}>
              <LineNumberedEditor value={preview.body} onChange={() => {}} filename={preview.source_filename} />
            </div>
          </div>

          {(preview.ignored_entries.length > 0 || preview.executable_entries.length > 0) && (
            <div style={s.warnBox}>
              {preview.executable_entries.length > 0 && (
                <div>
                  {t("file.executableIgnored", {
                    count: preview.executable_entries.length,
                    names: preview.executable_entries.join(", "),
                  })}
                </div>
              )}
              {preview.ignored_entries.length > 0 && (
                <div>
                  {t("file.ignoredEntries", {
                    count: preview.ignored_entries.length,
                    names: preview.ignored_entries.join(", "),
                  })}
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </Drawer>
  );
}
