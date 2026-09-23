import { describe, it, expect } from "vitest";
import { highlightQueryInTitle } from "./highlight-query";

describe("highlightQueryInTitle", () => {
  it("wraps every occurrence of the query in <mark>", () => {
    expect(highlightQueryInTitle("Add rate limiting to rate limiter", "rate")).toBe(
      "Add <mark>rate</mark> limiting to <mark>rate</mark> limiter",
    );
  });

  it("returns the title unchanged for an empty query", () => {
    expect(highlightQueryInTitle("Fix the login bug", "")).toBe("Fix the login bug");
  });
});
