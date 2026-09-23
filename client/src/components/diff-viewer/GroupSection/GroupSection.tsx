/* GroupSection — one collapsible Smart Diff role group: header (label, file
   count, files-with-findings dot) and, when open, its FileCards. A proper
   component (never a renderGroup()-style factory — react-best-practices,
   CRITICAL). */
"use client";

import React from "react";
import { Icon, SEV } from "@devdigest/ui";
import type { DiffGroupView } from "../groups";
import type { DiffCommentApi } from "../comments";
import type { DiffFindingsApi } from "../findings";
import { s, chevronFor } from "../styles";
import { FileCard } from "../FileCard";

export function GroupSection({
  group,
  commenting,
  findings,
}: {
  group: DiffGroupView;
  commenting?: DiffCommentApi;
  findings?: DiffFindingsApi;
}) {
  const [open, setOpen] = React.useState(!group.defaultCollapsed);

  return (
    <div>
      <div onClick={() => setOpen((o) => !o)} style={s.groupHeader}>
        <Icon.ChevronRight size={12} style={chevronFor(open)} />
        <span style={s.groupLabel}>{group.label}</span>
        <span style={s.groupDescription}>{group.description}</span>
        {group.filesWithFindings > 0 && (
          <span
            data-testid="group-findings-dot"
            aria-label={group.filesWithFindingsLabel}
            title={group.filesWithFindingsLabel}
            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: SEV.CRITICAL.c }}
          >
            ●{group.filesWithFindings}
          </span>
        )}
        <span className="tnum" style={s.fileStat}>
          {group.filesCountLabel}
        </span>
      </div>
      {open && (
        <div style={s.groupBody}>
          {group.files.map((f, i) => (
            <FileCard key={i} file={f} commenting={commenting} findings={findings} />
          ))}
        </div>
      )}
    </div>
  );
}
