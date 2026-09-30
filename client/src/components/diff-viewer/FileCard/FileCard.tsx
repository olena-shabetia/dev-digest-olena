/* FileCard — one collapsible file in the diff: header (path, +/- stat, comment
   count) and, when open, its parsed lines plus any outdated comments. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import { Icon, SEV } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import type { PrFile } from "@/lib/types";
import { AUTO_EXPAND_MAX_LINES, STICKY_HEADER_ATTR, STICKY_HEADER_GAP } from "../constants";
import { parsePatch, type Line } from "../helpers";
import {
  buildThreads,
  keysForLine,
  partitionThreads,
  type CommentThread,
  type DiffCommentApi,
} from "../comments";
import { s, chevronFor } from "../styles";
import { CodeLine } from "../CodeLine";
import { OutdatedComments } from "../OutdatedComments";
import { anchorFindings, unanchoredFindings, type DiffFindingsApi } from "../findings";
import { OutdatedFindings } from "../OutdatedFindings";
import type { DiffTarget } from "../groups";

/** Threads anchored to a given parsed line (RIGHT=new, LEFT=old). */
function threadsForLine(ln: Line, matched: Map<string, CommentThread[]>): CommentThread[] {
  if (matched.size === 0) return [];
  const out: CommentThread[] = [];
  for (const key of keysForLine(ln)) {
    const list = matched.get(key);
    if (list) out.push(...list);
  }
  return out;
}

/** Findings anchored to a given parsed line, via the same `RIGHT:<line>` key. */
function findingsForLine(ln: Line, byKey: Map<string, FindingRecord[]>): FindingRecord[] {
  if (byKey.size === 0) return [];
  const out: FindingRecord[] = [];
  for (const key of keysForLine(ln)) {
    const list = byKey.get(key);
    if (list) out.push(...list);
  }
  return out;
}

export function FileCard({
  file,
  commenting,
  findings,
  target,
}: {
  file: PrFile;
  commenting?: DiffCommentApi;
  findings?: DiffFindingsApi;
  /** Set only on the target file's card; forces open, scrolls, highlights. */
  target?: DiffTarget | null;
}) {
  const t = useTranslations("shell");
  const [open, setOpen] = React.useState(
    !!target || (file.additions ?? 0) + (file.deletions ?? 0) <= AUTO_EXPAND_MAX_LINES
  );
  const lines = React.useMemo(() => parsePatch(file.patch), [file.patch]);

  // Arrival: open, then scroll the target line (or the card) into view once
  // per target key. Refs only — the path/line are never used as selectors.
  const cardRef = React.useRef<HTMLDivElement>(null);
  const headerRef = React.useRef<HTMLDivElement>(null);
  const lineRef = React.useRef<HTMLDivElement>(null);
  const targetKey = target?.key ?? null;
  React.useEffect(() => {
    if (!targetKey) return;
    setOpen(true);
    const raf = requestAnimationFrame(() => {
      const reduce =
        typeof window.matchMedia === "function" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
      const el = lineRef.current ?? cardRef.current;
      // Keep the target clear of a sticky page header (its height can vary).
      const sticky = document.querySelector(`[${STICKY_HEADER_ATTR}]`);
      if (el && sticky) el.style.scrollMarginTop = `${sticky.getBoundingClientRect().height + STICKY_HEADER_GAP}px`;
      el?.scrollIntoView?.({ block: "start", behavior: reduce ? "auto" : "smooth" });
      headerRef.current?.focus({ preventScroll: true });
    });
    return () => cancelAnimationFrame(raf);
  }, [targetKey]);
  const targetLineNo = target?.line ?? null;
  const highlighted = !!target?.highlight;

  // Group this file's comments into threads, then split into ones we can anchor
  // to a rendered line vs. "outdated" (GitHub dropped the line / it's not here).
  const comments = commenting?.comments;
  const { matched, outdated } = React.useMemo(() => {
    if (!comments) return { matched: new Map<string, CommentThread[]>(), outdated: [] };
    const fileThreads = buildThreads(comments.filter((c) => c.path === file.path));
    const renderedKeys = new Set<string>();
    for (const ln of lines) for (const k of keysForLine(ln)) renderedKeys.add(k);
    return partitionThreads(fileThreads, renderedKeys);
  }, [comments, file.path, lines]);

  const commentCount = commenting
    ? commenting.comments.filter((c) => c.path === file.path).length
    : 0;

  // This file's findings (unfiltered), anchored to the same RIGHT:<line> keys
  // CodeLine already uses for comment threading — a SEPARATE indicator from
  // the comment count above (client/specs/L03-smart-diff.ui.md: the two
  // answer different questions and must never be merged into one icon).
  const findingsByPath = findings?.byPath;
  const fileFindings = React.useMemo(
    () => findingsByPath?.get(file.path) ?? [],
    [findingsByPath, file.path],
  );
  const findingsByKey = React.useMemo(() => anchorFindings(fileFindings), [fileFindings]);
  const outsidePatchFindings = React.useMemo(
    () => unanchoredFindings(fileFindings, findingsByKey),
    [fileFindings, findingsByKey],
  );

  return (
    <div
      ref={cardRef}
      style={highlighted ? { ...s.fileCard, ...s.fileCardTarget } : s.fileCard}
      data-diff-target={target ? "true" : undefined}
    >
      <div ref={headerRef} tabIndex={target ? -1 : undefined} onClick={() => setOpen((o) => !o)} style={s.fileHeader}>
        <Icon.ChevronRight size={13} style={chevronFor(open)} />
        <Icon.FileText size={14} style={s.fileIcon} />
        <span className="mono" style={s.filePath}>
          {file.path}
        </span>
        <span className="mono tnum" style={s.fileStat}>
          <span style={s.addText}>+{file.additions}</span>{" "}
          <span style={s.delText}>−{file.deletions}</span>
        </span>
        {commentCount > 0 && (
          <span
            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: "var(--text-muted)" }}
          >
            <Icon.MessageSquare size={12} />
            {commentCount}
          </span>
        )}
        {fileFindings.length > 0 && (
          <span
            data-testid="file-findings-dot"
            aria-label={findings?.fileFindingsLabel(fileFindings.length)}
            title={findings?.fileFindingsLabel(fileFindings.length)}
            style={{ display: "inline-flex", alignItems: "center", gap: 4, fontSize: 12, color: SEV.CRITICAL.c }}
          >
            <Icon.AlertOctagon size={12} />
            {fileFindings.length}
          </span>
        )}
      </div>
      {open && (
        <div style={s.fileBody}>
          {lines.length === 0 ? (
            <div style={s.noDiff}>{t("diffViewer.noDiffText")}</div>
          ) : (
            lines.map((ln, i) => {
              const isTargetLine = targetLineNo !== null && ln.kind !== "hunk" && ln.newNo === targetLineNo;
              const row = (
              <CodeLine
                key={i}
                ln={ln}
                path={file.path}
                threads={threadsForLine(ln, matched)}
                commenting={commenting}
                lineFindings={findingsForLine(ln, findingsByKey)}
                findings={findings}
              />
              );
              return isTargetLine ? (
                <div key={i} ref={lineRef}>
                  {row}
                </div>
              ) : (
                row
              );
            })
          )}
          {commenting && commenting.showComments && <OutdatedComments threads={outdated} />}
          {findings && findings.showFindings && (
            <OutdatedFindings findings={outsidePatchFindings} api={findings} />
          )}
        </div>
      )}
    </div>
  );
}
