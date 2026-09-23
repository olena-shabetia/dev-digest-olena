/* DiffViewer — basic GitHub-style unified diff viewer. Renders real PrFile.patch
   (unified-diff text from the F1 API) as a list of collapsible FileCards.
   Optional inline comments (Files changed tab): hover a line → "+" → comment,
   posted live to GitHub; existing GitHub review comments render inline. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { PrFile } from "@/lib/types";
import { type DiffCommentApi } from "../comments";
import { type DiffGroupView } from "../groups";
import { type DiffFindingsApi } from "../findings";
import { s } from "../styles";
import { FileCard } from "../FileCard";
import { GroupSection } from "../GroupSection";

export function DiffViewer({
  files,
  commenting,
  groups,
  findings,
}: {
  files: PrFile[];
  commenting?: DiffCommentApi;
  /** When present, render grouped by Smart Diff role; else fall back to the
   *  flat `files` list below, byte-identical to pre-L03 behaviour. */
  groups?: DiffGroupView[];
  findings?: DiffFindingsApi;
}) {
  const t = useTranslations("shell");

  if (groups) {
    const nonEmpty = groups.filter((g) => g.files.length > 0);
    if (nonEmpty.length === 0) {
      return <div style={s.empty}>{t("diffViewer.noChangedFiles")}</div>;
    }
    return (
      <div style={s.list}>
        {nonEmpty.map((g) => (
          <GroupSection key={g.role} group={g} commenting={commenting} findings={findings} />
        ))}
      </div>
    );
  }

  if (!files || files.length === 0) {
    return <div style={s.empty}>{t("diffViewer.noChangedFiles")}</div>;
  }
  return (
    <div style={s.list}>
      {files.map((f, i) => (
        <FileCard key={i} file={f} commenting={commenting} />
      ))}
    </div>
  );
}
