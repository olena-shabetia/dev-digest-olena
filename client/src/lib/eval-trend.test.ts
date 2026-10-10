import { describe, it, expect } from "vitest";
import type { EvalSetRunSummary } from "@devdigest/shared";
import { chartDomain, metricSeries, regressionSummary, trendRuns } from "./eval-trend";

const run = (id: string, status: EvalSetRunSummary["status"], recall: number | null): EvalSetRunSummary =>
  ({ id, status, recall, precision: 0.9, citation_accuracy: 1 }) as EvalSetRunSummary;

describe("trendRuns", () => {
  it("keeps completed runs only, oldest first, capped to the latest N", () => {
    const newestFirst = [
      run("d", "completed", 0.9),
      run("x", "failed", null),
      run("c", "running", null),
      run("b", "completed", 0.8),
      run("a", "completed", 0.7),
    ];
    expect(trendRuns(newestFirst).map((r) => r.id)).toEqual(["a", "b", "d"]);
    expect(trendRuns(newestFirst, 2).map((r) => r.id)).toEqual(["b", "d"]);
  });
});

describe("metricSeries", () => {
  it("skips runs where the metric is not applicable", () => {
    const runs = [run("a", "completed", 0.5), run("b", "completed", null), run("c", "completed", 1)];
    expect(metricSeries(runs, "recall")).toEqual([0.5, 1]);
  });
});

describe("chartDomain", () => {
  it("floors just under the minimum and always tops out at 100 %", () => {
    expect(chartDomain([0.82, 0.91])).toEqual([0.7, 1]);
    expect(chartDomain([0.3])).toEqual([0.2, 1]);
  });
  it("is clamped to a sensible band", () => {
    expect(chartDomain([0.99])).toEqual([0.9, 1]);
    expect(chartDomain([0])).toEqual([0, 1]);
    expect(chartDomain([])).toEqual([0, 1]);
  });
});

describe("regressionSummary", () => {
  it("separates drops from improvements and rounds to whole points", () => {
    const s = regressionSummary({ recall: 0.04, precision: -0.02, citation_accuracy: 0.001 });
    expect(s.dropped).toEqual([{ key: "precision", points: 2 }]);
    expect(s.improved).toEqual([{ key: "recall", points: 4 }]);
  });
  it("ignores sub-point noise, nulls and a missing delta", () => {
    expect(regressionSummary({ recall: -0.004, precision: null, citation_accuracy: 0 })).toEqual({
      dropped: [],
      improved: [],
    });
    expect(regressionSummary(null)).toEqual({ dropped: [], improved: [] });
  });
});
