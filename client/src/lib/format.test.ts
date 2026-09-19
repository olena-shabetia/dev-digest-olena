import { describe, it, expect } from "vitest";
import { formatCost, formatSeconds, formatTokens, formatTokenCount } from "./format";

describe("formatCost", () => {
  it("null/undefined is UNKNOWN, never $0.00", () => {
    expect(formatCost(null)).toBe("—");
    expect(formatCost(undefined)).toBe("—");
  });

  it("sub-cent runs get 4 decimal places so they don't all round to $0.00", () => {
    expect(formatCost(0.0013)).toBe("$0.0013");
    expect(formatCost(0)).toBe("$0.0000");
  });

  it("typical runs get 3 decimal places", () => {
    expect(formatCost(0.014)).toBe("$0.014");
    expect(formatCost(1.205)).toBe("$1.205");
  });

  it("large runs get 2 decimal places", () => {
    expect(formatCost(12.4)).toBe("$12.40");
  });
});

describe("formatTokens / formatTokenCount", () => {
  it("formats the drawer's in→out summary", () => {
    expect(formatTokens(8200, 1300)).toBe("8.2K→1.3K");
  });

  it("formats a single count with a thousands separator", () => {
    expect(formatTokenCount(9119)).toBe("9,119");
  });
});

describe("formatSeconds", () => {
  it("formats milliseconds as seconds", () => {
    expect(formatSeconds(8200)).toBe("8.2s");
  });
});
