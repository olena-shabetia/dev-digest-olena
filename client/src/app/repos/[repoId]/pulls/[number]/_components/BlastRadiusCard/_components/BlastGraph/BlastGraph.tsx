/* BlastGraph — hand-rolled SVG node-link diagram, three fixed columns
   (changed symbol -> callers -> endpoints affected). No text-DSL-to-innerHTML
   diagram library: symbol/path text is repo-derived and untrusted, so it goes
   through React's escaped <text> nodes only, never innerHTML. */
"use client";

import React from "react";
import { useTranslations } from "next-intl";
import type { BlastRadiusResponse } from "@devdigest/shared";
import { githubBlobUrl } from "@/lib/github-urls";
import {
  ENDPOINT_COLOR,
  GRAPH_NODE_HEIGHT,
  GRAPH_NODE_WIDTH,
  SYMBOL_COLOR,
} from "../../constants";
import { layoutBlastGraph, type BlastGraphNode } from "../../helpers";
import { s } from "../../styles";

const NODE_COLOR: Record<BlastGraphNode["kind"], string> = {
  symbol: SYMBOL_COLOR,
  caller: "var(--text-secondary)",
  endpoint: ENDPOINT_COLOR.color,
  more: "var(--text-muted)",
};

export function BlastGraph({
  data,
  repoFullName,
  headSha,
}: {
  data: BlastRadiusResponse;
  repoFullName: string | null;
  headSha: string;
}) {
  const t = useTranslations("blast");
  const layout = React.useMemo(
    () => layoutBlastGraph(data.downstream, data.facts_by_file),
    [data],
  );

  if (layout.nodes.length === 0) {
    return <p style={s.emptyRow}>{t("graph.empty")}</p>;
  }

  const nodeById = new Map(layout.nodes.map((n) => [n.id, n]));

  return (
    <div style={s.graphWrap}>
      <svg
        role="img"
        aria-label={t("graph.ariaLabel")}
        viewBox={`0 0 ${layout.width} ${layout.height}`}
        width="100%"
        height={layout.height}
      >
        {layout.edges.map((edge) => {
          const from = nodeById.get(edge.from);
          const to = nodeById.get(edge.to);
          if (!from || !to) return null;
          const x1 = from.x + GRAPH_NODE_WIDTH;
          const y1 = from.y + GRAPH_NODE_HEIGHT / 2;
          const x2 = to.x;
          const y2 = to.y + GRAPH_NODE_HEIGHT / 2;
          const midX = (x1 + x2) / 2;
          return (
            <path
              key={`${edge.from}->${edge.to}`}
              d={`M ${x1} ${y1} C ${midX} ${y1}, ${midX} ${y2}, ${x2} ${y2}`}
              fill="none"
              stroke="var(--border)"
              strokeWidth={1.5}
            />
          );
        })}

        {layout.nodes.map((node) => {
          const label =
            node.kind === "more" ? t("graph.more", { count: node.count ?? 0 }) : node.label;
          const rect = (
            <>
              <rect
                x={node.x}
                y={node.y}
                width={GRAPH_NODE_WIDTH}
                height={GRAPH_NODE_HEIGHT}
                rx={5}
                fill="var(--bg-elevated)"
                stroke={NODE_COLOR[node.kind]}
                strokeWidth={1.5}
              />
              <text
                x={node.x + 10}
                y={node.y + GRAPH_NODE_HEIGHT / 2 + 4}
                fontSize={12}
                fill="var(--text-primary)"
              >
                {label.length > 26 ? `${label.slice(0, 25)}…` : label}
              </text>
            </>
          );

          if (node.kind === "caller" && repoFullName && node.file != null && node.line != null) {
            return (
              <a
                key={node.id}
                href={githubBlobUrl(repoFullName, headSha, node.file, node.line)}
                target="_blank"
                rel="noopener noreferrer"
              >
                <title>{`${node.file}:${node.line}`}</title>
                {rect}
              </a>
            );
          }

          return <g key={node.id}>{rect}</g>;
        })}
      </svg>

      <div style={s.legend}>
        <span style={s.legendItem}>
          <span style={{ ...s.legendDot, background: SYMBOL_COLOR }} />
          {t("graph.legend.changed")}
        </span>
        <span style={s.legendItem}>
          <span style={{ ...s.legendDot, background: "var(--text-secondary)" }} />
          {t("graph.legend.callers")}
        </span>
        <span style={s.legendItem}>
          <span style={{ ...s.legendDot, background: ENDPOINT_COLOR.color }} />
          {t("graph.legend.endpoints")}
        </span>
      </div>
    </div>
  );
}

