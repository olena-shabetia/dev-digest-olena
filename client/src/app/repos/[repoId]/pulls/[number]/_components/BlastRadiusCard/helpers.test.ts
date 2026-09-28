import { describe, it, expect } from "vitest";
import type { BlastRadiusResponse } from "@devdigest/shared";
import {
  degradedKey,
  headerCronLabel,
  humanizeCron,
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

describe("humanizeCron", () => {
  it("recognizes an every-N-minutes expression", () => {
    expect(humanizeCron("*/5 * * * *")).toEqual({ key: "cron.everyNMinutes", params: { n: 5 } });
  });

  it("collapses */1 to the singular everyMinute key", () => {
    expect(humanizeCron("*/1 * * * *")).toEqual({ key: "cron.everyMinute" });
    expect(humanizeCron("* * * * *")).toEqual({ key: "cron.everyMinute" });
  });

  it("recognizes hourly, every-N-hours, daily and weekly shapes", () => {
    expect(humanizeCron("0 * * * *")).toEqual({ key: "cron.hourly" });
    expect(humanizeCron("0 */2 * * *")).toEqual({ key: "cron.everyNHours", params: { n: 2 } });
    expect(humanizeCron("0 3 * * *")).toEqual({ key: "cron.daily" });
    expect(humanizeCron("0 3 * * 1")).toEqual({ key: "cron.weekly" });
  });

  it("humanizes a job:<kind> fact into a name, no cadence", () => {
    expect(humanizeCron("job:reset-rate-buckets")).toEqual({
      key: "cron.job",
      params: { name: "reset rate buckets" },
    });
  });

  it("falls back to the raw expression for an unrecognized shape", () => {
    expect(humanizeCron("@reboot")).toEqual({ key: "cron.raw", params: { expr: "@reboot" } });
    expect(humanizeCron("15 2 1 * *")).toEqual({ key: "cron.raw", params: { expr: "15 2 1 * *" } });
  });
});

describe("headerCronLabel", () => {
  it("returns null when the symbol has no cron facts", () => {
    expect(headerCronLabel({ crons_affected: [] })).toBeNull();
  });

  it("returns a plain count, not the cadence, for exactly one cron fact", () => {
    expect(headerCronLabel({ crons_affected: ["*/5 * * * *"] })).toEqual({
      key: "cronCount",
      params: { count: 1 },
    });
  });

  it("returns a plain count for more than one cron fact", () => {
    expect(headerCronLabel({ crons_affected: ["*/5 * * * *", "job:x"] })).toEqual({
      key: "cronCount",
      params: { count: 2 },
    });
  });
});
