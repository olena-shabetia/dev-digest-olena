import { describe, it, expect } from "vitest";
import type { BlastRadiusResponse } from "@devdigest/shared";
import {
  degradedKey,
  layoutBlastGraph,
  showUnattributedEndpoints,
  uncalledCount,
} from "./helpers";

function makeData(overrides: Partial<BlastRadiusResponse> = {}): BlastRadiusResponse {
  return {
    changed_symbols: [
      { name: "rateLimit", file: "src/mw/rateLimit.ts", kind: "function" },
      { name: "unused", file: "src/mw/unused.ts", kind: "function" },
    ],
    downstream: [
      {
        symbol: "rateLimit",
        callers: [{ name: "publicRouter", file: "src/routes/public.ts", line: 23 }],
        endpoints_affected: ["GET /api/public/items"],
        crons_affected: [],
      },
    ],
    summary: "2 changed symbol(s), 1 caller(s), 1 endpoint(s), 0 cron job(s)",
    endpoints: ["GET /api/public/items"],
    crons: [],
    facts_by_file: {
      "src/routes/public.ts": { endpoints: ["GET /api/public/items"], crons: [] },
    },
    stats: { symbols: 2, callers: 1, endpoints: 1, crons: 0 },
    degraded: false,
    reason: null,
    ...overrides,
  };
}

describe("degradedKey", () => {
  it("prefixes the reason with degraded.", () => {
    expect(degradedKey("index_failed")).toBe("degraded.index_failed");
    expect(degradedKey("no_data")).toBe("degraded.no_data");
  });
});

describe("uncalledCount", () => {
  it("counts changed symbols with no callers, floored at 0", () => {
    expect(uncalledCount(makeData())).toBe(1);
  });

  it("returns 0 when every changed symbol has a caller", () => {
    const data = makeData({
      changed_symbols: [{ name: "rateLimit", file: "src/mw/rateLimit.ts", kind: "function" }],
      stats: { symbols: 1, callers: 1, endpoints: 1, crons: 0 },
    });
    expect(uncalledCount(data)).toBe(0);
  });
});

describe("showUnattributedEndpoints", () => {
  it("is true when top-level endpoints exist but no downstream entry attributes any", () => {
    const data = makeData({
      downstream: [
        {
          symbol: "rateLimit",
          callers: [{ name: "publicRouter", file: "src/routes/public.ts", line: 23 }],
          endpoints_affected: [],
          crons_affected: [],
        },
      ],
    });
    expect(showUnattributedEndpoints(data)).toBe(true);
  });

  it("is false when a downstream entry already attributes an endpoint", () => {
    expect(showUnattributedEndpoints(makeData())).toBe(false);
  });

  it("is false when there are no top-level endpoints", () => {
    expect(showUnattributedEndpoints(makeData({ endpoints: [] }))).toBe(false);
  });
});

describe("layoutBlastGraph", () => {
  it("places one node per symbol/caller/endpoint and edges only between placed nodes", () => {
    const data = makeData();
    const layout = layoutBlastGraph(data.downstream, data.facts_by_file);
    expect(layout.nodes.some((n) => n.kind === "symbol" && n.label === "rateLimit")).toBe(true);
    expect(layout.nodes.some((n) => n.kind === "caller" && n.label === "publicRouter")).toBe(true);
    expect(
      layout.nodes.some((n) => n.kind === "endpoint" && n.label === "GET /api/public/items"),
    ).toBe(true);
    const nodeIds = new Set(layout.nodes.map((n) => n.id));
    for (const edge of layout.edges) {
      expect(nodeIds.has(edge.from)).toBe(true);
      expect(nodeIds.has(edge.to)).toBe(true);
    }
  });

  it("caps each column and adds a 'more' node carrying the overflow count", () => {
    const downstream = Array.from({ length: 10 }, (_, i) => ({
      symbol: `sym${i}`,
      callers: [{ name: `caller${i}`, file: `src/f${i}.ts`, line: 1 }],
      endpoints_affected: [],
      crons_affected: [],
    }));
    const layout = layoutBlastGraph(downstream, {});
    const symbolMore = layout.nodes.find((n) => n.id === "symbol:more");
    expect(symbolMore).toBeDefined();
    expect(symbolMore?.count).toBe(4); // 10 - MAX_GRAPH_SYMBOLS(6)
  });

  it("returns no nodes/edges for empty downstream", () => {
    const layout = layoutBlastGraph([], {});
    expect(layout.nodes).toHaveLength(0);
    expect(layout.edges).toHaveLength(0);
  });
});
