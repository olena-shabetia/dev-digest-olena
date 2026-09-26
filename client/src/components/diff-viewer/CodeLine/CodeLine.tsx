/* CodeLine — one rendered diff line: gutter number, +/- sign, text, plus the
   hover "+" affordance, any anchored comment threads, and an inline composer. */
"use client";

import React from "react";
import { SEV } from "@devdigest/ui";
import type { FindingRecord } from "@devdigest/shared";
import { FindingCard } from "@/components/finding-card";
import { commentTargetFor, type CommentThread, type DiffCommentApi, cs } from "../comments";
import { type Line } from "../helpers";
import { s, lineRowFor, lineSignFor } from "../styles";
import { CommentThreadView } from "../CommentThreadView";
import { InlineComposer } from "../InlineComposer";
import { highestSeverity, type DiffFindingsApi } from "../findings";

export function CodeLine({
  ln,
  path,
  threads,
  commenting,
  lineFindings,
  findings,
}: {
  ln: Line;
  path: string;
  threads: CommentThread[];
  commenting?: DiffCommentApi;
  /** This line's findings, already matched via `RIGHT:<start_line>` (FileCard). */
  lineFindings?: FindingRecord[];
  /** Labels/callbacks/context shared by every finding card in this file. */
  findings?: DiffFindingsApi;
}) {
  const [hover, setHover] = React.useState(false);
  const [composing, setComposing] = React.useState(false);

  if (ln.kind === "hunk") {
    return (
      <div className="mono" style={s.hunk}>
        {ln.text}
      </div>
    );
  }

  const sign = ln.kind === "add" ? "+" : ln.kind === "del" ? "−" : "";
  const target = commenting?.canComment ? commentTargetFor(ln) : null;
  const showAdd = hover && !!target && !composing;
  const anchored = findings?.showFindings ? (lineFindings ?? []) : [];
  const severity = highestSeverity(anchored);
  const sevBar = severity ? SEV[severity] : null;

  return (
    <div
      style={cs.rowWrap}
      onMouseEnter={() => setHover(true)}
      onMouseLeave={() => setHover(false)}
    >
      <div style={{ ...lineRowFor(ln.kind), ...(sevBar ? { boxShadow: `inset 3px 0 0 ${sevBar.c}` } : {}) }}>
        <span className="mono tnum" style={{ ...s.lineNo, position: "relative" }}>
          {showAdd && target && (
            <button
              type="button"
              title="Add a comment on this line"
              aria-label="Add a comment on this line"
              onClick={() => setComposing(true)}
              style={cs.addBtn}
            >
              +
            </button>
          )}
          {ln.newNo ?? ln.oldNo ?? ""}
        </span>
        <span className="mono" style={lineSignFor(ln.kind)}>
          {sign}
        </span>
        <span className="mono" style={s.lineText}>
          {ln.text || " "}
        </span>
        {severity && findings && (
          <span className="mono" style={{ ...s.lineNo, width: "auto", color: sevBar?.c, textTransform: "uppercase", fontSize: 11 }}>
            {findings.lineLabels[severity]}
          </span>
        )}
      </div>

      {commenting &&
        commenting.showComments &&
        threads.map((th) => (
          <CommentThreadView key={th.rootId} thread={th} commenting={commenting} path={path} />
        ))}

      {commenting && composing && target && (
        <InlineComposer
          commenting={commenting}
          path={path}
          line={target.line}
          side={target.side}
          onClose={() => setComposing(false)}
        />
      )}

      {findings &&
        findings.showFindings &&
        anchored.map((f) => (
          <div key={f.id} style={cs.thread}>
            <FindingCard
              f={f}
              defaultExpanded
              pending={findings.pendingFindingId === f.id}
              repoFullName={findings.repoFullName}
              headSha={findings.headSha}
              onAction={(action, reply) => findings.onAction?.(f.id, action, reply)}
            />
          </div>
        ))}
    </div>
  );
}
