/* Pure, React-free helpers for BlastRadiusCard. All shaping (grouping,
   counts, summary) already happened server-side (blast/helpers.ts) — these
   only derive small UI-local view values from the frozen BlastRadiusResponse
   shape, per frontend-ui-architecture's business-logic ladder rung 3. */
import type { BlastRadiusResponse } from "@devdigest/shared";
import {
  GRAPH_COLUMN_X,
  GRAPH_NODE_GAP,
  GRAPH_NODE_HEIGHT,
  GRAPH_TOP_PADDING,
  MAX_GRAPH_CALLERS,
  MAX_GRAPH_ENDPOINTS,
  MAX_GRAPH_SYMBOLS,
} from "./constants";

/** i18n key for a degraded reason, e.g. "index_failed" -> "degraded.index_failed". */
export function degradedKey(reason: string): string {
  return `degraded.${reason}`;
}

/** How many changed symbols have zero callers (never negative). */
export function uncalledCount(data: BlastRadiusResponse): number {
  const namesWithCallers = new Set(data.downstream.map((d) => d.symbol));
  const distinctChanged = new Set(data.changed_symbols.map((s) => s.name));
  let called = 0;
  for (const name of distinctChanged) {
    if (namesWithCallers.has(name)) called += 1;
  }
  return Math.max(0, data.stats.symbols - called);
}

/** True when there are top-level endpoints but no downstream entry attributes
 *  any of them to a specific caller (the facade's degraded ripgrep path). */
export function showUnattributedEndpoints(data: BlastRadiusResponse): boolean {
  return (
    data.endpoints.length > 0 &&
    data.downstream.every((d) => d.endpoints_affected.length === 0)
  );
}

// ---- Graph layout ----

export type BlastGraphNodeKind = "symbol" | "caller" | "endpoint" | "more";

export interface BlastGraphNode {
  id: string;
  kind: BlastGraphNodeKind;
  label: string;
  x: number;
  y: number;
  file?: string;
  line?: number;
  count?: number;
}

export interface BlastGraphEdge {
  from: string;
  to: string;
}

export interface BlastGraphLayout {
  nodes: BlastGraphNode[];
  edges: BlastGraphEdge[];
  width: number;
  height: number;
}

type FactsByFile = BlastRadiusResponse["facts_by_file"];
type Downstream = BlastRadiusResponse["downstream"];

function nextY(index: number): number {
  return GRAPH_TOP_PADDING + index * (GRAPH_NODE_HEIGHT + GRAPH_NODE_GAP);
}

/** Lays out the three-column graph: changed symbols -> callers -> endpoints.
 *  Each column is capped; a trailing "more" node absorbs the remainder.
 *  Edges are only ever added between nodes that were actually placed. */
export function layoutBlastGraph(
  downstream: Downstream,
  factsByFile: FactsByFile,
): BlastGraphLayout {
  const nodes: BlastGraphNode[] = [];
  const edges: BlastGraphEdge[] = [];

  const shownSymbols = downstream.slice(0, MAX_GRAPH_SYMBOLS);
  const hiddenSymbols = downstream.length - shownSymbols.length;

  shownSymbols.forEach((d, i) => {
    nodes.push({
      id: `symbol:${d.symbol}`,
      kind: "symbol",
      label: d.symbol,
      x: GRAPH_COLUMN_X.symbol,
      y: nextY(i),
    });
  });
  if (hiddenSymbols > 0) {
    nodes.push({
      id: "symbol:more",
      kind: "more",
      label: "",
      x: GRAPH_COLUMN_X.symbol,
      y: nextY(shownSymbols.length),
      count: hiddenSymbols,
    });
  }

  // De-duplicate callers by file:name:line across the shown symbols.
  const callerIndex = new Map<string, { name: string; file: string; line: number }>();
  for (const d of shownSymbols) {
    for (const c of d.callers) {
      const id = `${c.file}:${c.name}:${c.line}`;
      if (!callerIndex.has(id)) callerIndex.set(id, c);
    }
  }
  const allCallerIds = [...callerIndex.keys()];
  const shownCallerIds = allCallerIds.slice(0, MAX_GRAPH_CALLERS);
  const hiddenCallers = allCallerIds.length - shownCallerIds.length;
  const shownCallerIdSet = new Set(shownCallerIds);

  shownCallerIds.forEach((id, i) => {
    const c = callerIndex.get(id)!;
    nodes.push({
      id: `caller:${id}`,
      kind: "caller",
      label: c.name,
      x: GRAPH_COLUMN_X.caller,
      y: nextY(i),
      file: c.file,
      line: c.line,
    });
  });
  const callerMoreY = nextY(shownCallerIds.length);
  if (hiddenCallers > 0) {
    nodes.push({
      id: "caller:more",
      kind: "more",
      label: "",
      x: GRAPH_COLUMN_X.caller,
      y: callerMoreY,
      count: hiddenCallers,
    });
  }

  // symbol -> caller edges (only for callers that were placed).
  for (const d of shownSymbols) {
    for (const c of d.callers) {
      const id = `${c.file}:${c.name}:${c.line}`;
      if (shownCallerIdSet.has(id)) {
        edges.push({ from: `symbol:${d.symbol}`, to: `caller:${id}` });
      }
    }
  }

  // endpoints from each placed caller's file, de-duplicated.
  const endpointSet = new Set<string>();
  for (const id of shownCallerIds) {
    const c = callerIndex.get(id)!;
    for (const ep of factsByFile[c.file]?.endpoints ?? []) endpointSet.add(ep);
  }
  const allEndpoints = [...endpointSet];
  const shownEndpoints = allEndpoints.slice(0, MAX_GRAPH_ENDPOINTS);
  const hiddenEndpoints = allEndpoints.length - shownEndpoints.length;

  shownEndpoints.forEach((ep, i) => {
    nodes.push({
      id: `endpoint:${ep}`,
      kind: "endpoint",
      label: ep,
      x: GRAPH_COLUMN_X.endpoint,
      y: nextY(i),
    });
  });
  const endpointMoreY = nextY(shownEndpoints.length);
  if (hiddenEndpoints > 0) {
    nodes.push({
      id: "endpoint:more",
      kind: "more",
      label: "",
      x: GRAPH_COLUMN_X.endpoint,
      y: endpointMoreY,
      count: hiddenEndpoints,
    });
  }
  const shownEndpointSet = new Set(shownEndpoints);

  for (const id of shownCallerIds) {
    const c = callerIndex.get(id)!;
    for (const ep of factsByFile[c.file]?.endpoints ?? []) {
      if (shownEndpointSet.has(ep)) {
        edges.push({ from: `caller:${id}`, to: `endpoint:${ep}` });
      }
    }
  }

  const maxY = Math.max(
    nextY(shownSymbols.length + (hiddenSymbols > 0 ? 1 : 0)),
    nextY(shownCallerIds.length + (hiddenCallers > 0 ? 1 : 0)),
    nextY(shownEndpoints.length + (hiddenEndpoints > 0 ? 1 : 0)),
    nextY(1),
  );

  return {
    nodes,
    edges,
    width: GRAPH_COLUMN_X.endpoint + 220,
    height: maxY,
  };
}
