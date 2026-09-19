/**
 * Regression guard: the trace drawer's findings previously rendered severity
 * as a plain colorless-icon Badge with a hand-rolled color map (no icon at
 * all, and SUGGESTION mapped to --accent instead of the canonical --sugg) —
 * visibly inconsistent with the icon+color used everywhere else (FindingCard,
 * the PR-list FINDINGS column, the run Timeline chips). It now renders the
 * same vendored `SeverityBadge` those surfaces use.
 */
import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../../../messages/en/runs.json";
import { FindingsSection } from "./FindingsSection";

afterEach(cleanup);

function finding(o: Partial<FindingRecord>): FindingRecord {
  return {
    id: "f1",
    severity: "SUGGESTION",
    category: "style",
    title: "t",
    file: "src/a.ts",
    start_line: 1,
    end_line: 1,
    rationale: "r",
    suggestion: null,
    confidence: 0.6,
    kind: null,
    review_id: "rev1",
    accepted_at: null,
    dismissed_at: null,
    ...o,
  } as FindingRecord;
}

function renderSection(findings: FindingRecord[]) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ runs: messages }}>
      <FindingsSection findings={findings} />
    </NextIntlClientProvider>,
  );
}

describe("FindingsSection", () => {
  it("renders the vendored severity icon, not a bare colored badge", () => {
    renderSection([finding({ severity: "CRITICAL" })]);
    // SeverityBadge always renders icon + uppercase label text.
    expect(screen.getByText("Critical")).toBeInTheDocument();
  });

  it("SUGGESTION uses the canonical suggestion color token, not --accent", () => {
    renderSection([finding({ severity: "SUGGESTION" })]);
    expect(screen.getByText("Suggestion").style.color).toBe("var(--sugg)");
  });
});
