import { describe, it, expect } from "vitest";
import { severityBuckets, bySeverity } from "./severity";

describe("severityBuckets", () => {
  it("omits severities that are not present", () => {
    const buckets = severityBuckets([{ severity: "CRITICAL" }, { severity: "WARNING" }]);
    expect(buckets.map((b) => b.severity)).toEqual(["CRITICAL", "WARNING"]);
  });

  it("orders CRITICAL → WARNING → SUGGESTION regardless of input order", () => {
    const buckets = severityBuckets([
      { severity: "SUGGESTION" },
      { severity: "CRITICAL" },
      { severity: "WARNING" },
    ]);
    expect(buckets.map((b) => b.severity)).toEqual(["CRITICAL", "WARNING", "SUGGESTION"]);
  });

  it("counts each severity independently", () => {
    const buckets = severityBuckets([
      { severity: "CRITICAL" },
      { severity: "CRITICAL" },
      { severity: "SUGGESTION" },
    ]);
    expect(buckets).toEqual([
      { severity: "CRITICAL", count: 2 },
      { severity: "SUGGESTION", count: 1 },
    ]);
  });

  it("empty input yields no buckets", () => {
    expect(severityBuckets([])).toEqual([]);
  });

  it("an unrecognized severity is included and sorts last", () => {
    const buckets = severityBuckets([{ severity: "INFO" }, { severity: "CRITICAL" }]);
    expect(buckets.map((b) => b.severity)).toEqual(["CRITICAL", "INFO"]);
  });
});

describe("bySeverity", () => {
  const findings = [
    { severity: "CRITICAL", id: 1 },
    { severity: "WARNING", id: 2 },
    { severity: "CRITICAL", id: 3 },
  ];

  it("null returns every item, unfiltered", () => {
    expect(bySeverity(findings, null)).toEqual(findings);
  });

  it("filters to the requested severity only", () => {
    expect(bySeverity(findings, "CRITICAL").map((f) => f.id)).toEqual([1, 3]);
  });
});
