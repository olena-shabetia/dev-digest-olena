import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";

vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useFindingAction: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { FindingsPanel } from "./FindingsPanel";

afterEach(cleanup);

function finding(overrides: Partial<FindingRecord>): FindingRecord {
  return {
    id: "f1",
    severity: "CRITICAL",
    category: "security",
    title: "Hardcoded secret",
    file: "src/config.ts",
    start_line: 11,
    end_line: 11,
    rationale: "A secret is committed.",
    suggestion: null,
    confidence: 0.95,
    kind: "finding",
    trifecta_components: null,
    evidence: null,
    review_id: "r1",
    accepted_at: null,
    dismissed_at: null,
    ...overrides,
  };
}

const FINDINGS: FindingRecord[] = [finding({})];

const MIXED: FindingRecord[] = [
  finding({ id: "f1", severity: "CRITICAL", title: "Hardcoded secret", confidence: 0.95 }),
  finding({ id: "f2", severity: "WARNING", title: "N+1 query", confidence: 0.86 }),
  finding({ id: "f3", severity: "SUGGESTION", title: "Magic number", confidence: 0.4 }),
];

const WITH_OUT_OF_SCOPE: FindingRecord[] = [
  finding({ id: "f1", severity: "WARNING", title: "N+1 query", confidence: 0.86, in_scope: true }),
  finding({
    id: "f2",
    severity: "CRITICAL",
    title: "Unrelated hardcoded secret",
    confidence: 0.9,
    in_scope: false,
  }),
  finding({
    id: "f3",
    severity: "SUGGESTION",
    title: "Unrelated style nit",
    confidence: 0.7,
    in_scope: false,
  }),
];

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("FindingsPanel (smoke)", () => {
  it("renders the toolbar + a finding card", () => {
    renderWithIntl(<FindingsPanel findings={FINDINGS} prId="pr1" />);
    expect(screen.getByText("Hide low confidence")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
  });

  it("shows the empty state when nothing matches", () => {
    renderWithIntl(<FindingsPanel findings={[]} prId="pr1" />);
    expect(screen.getByText("No findings match")).toBeInTheDocument();
  });
});

describe("FindingsPanel severity pills", () => {
  it("shows a pill only for severities actually present", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    expect(screen.getByRole("button", { name: /critical/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /warning/i })).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /suggestion/i })).toBeInTheDocument();
  });

  it("pill count equals the number of finding cards rendered", () => {
    const { container } = renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    // one card per finding shown, all three severities present
    expect(container.querySelectorAll("[data-finding-id]")).toHaveLength(3);
  });

  it("clicking a pill filters the list to that severity; clicking again clears it", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    fireEvent.click(screen.getByRole("button", { name: /critical/i }));
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
    expect(screen.queryByText("N+1 query")).not.toBeInTheDocument();
    expect(screen.queryByText("Magic number")).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: /critical/i }));
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
    expect(screen.getByText("N+1 query")).toBeInTheDocument();
    expect(screen.getByText("Magic number")).toBeInTheDocument();
  });

  it("hiding low-confidence findings shrinks (or removes) the matching pill", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    fireEvent.click(screen.getByRole("switch"));
    // SUGGESTION (confidence 0.4) drops below the threshold and disappears entirely
    expect(screen.queryByRole("button", { name: /suggestion/i })).not.toBeInTheDocument();
  });

  it("falls back to the full list, not an empty one, when the active severity vanishes", () => {
    renderWithIntl(<FindingsPanel findings={MIXED} prId="pr1" />);
    fireEvent.click(screen.getByRole("button", { name: /suggestion/i }));
    expect(screen.getByText("Magic number")).toBeInTheDocument();
    // now hide low confidence — the SUGGESTION finding (0.4) drops out
    fireEvent.click(screen.getByRole("switch"));
    expect(screen.queryByText("No findings match")).not.toBeInTheDocument();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
    expect(screen.getByText("N+1 query")).toBeInTheDocument();
  });
});

describe("FindingsPanel scope disclosure (L03)", () => {
  it("collapses out-of-scope findings behind a disclosure, always surfaces the most severe one, and expands on click", () => {
    renderWithIntl(<FindingsPanel findings={WITH_OUT_OF_SCOPE} prId="pr1" />);

    // in-scope finding always visible
    expect(screen.getByText("N+1 query")).toBeInTheDocument();
    // both out-of-scope findings collapse behind the disclosure by default...
    expect(screen.queryByText("Unrelated style nit")).not.toBeInTheDocument();
    // ...except the single most severe one (CRITICAL beats SUGGESTION), which
    // is always surfaced as its own strip.
    expect(screen.getByText("Unrelated hardcoded secret")).toBeInTheDocument();

    // disclosure names the count honestly, never claims findings are "hidden"
    const disclosure = screen.getByText(/2 findings outside the stated scope/i);
    expect(disclosure).toBeInTheDocument();

    fireEvent.click(disclosure);
    expect(screen.getByText("Unrelated style nit")).toBeInTheDocument();
  });

  it("treats in_scope === null as in-scope by default (never swept behind the disclosure)", () => {
    const findings = [finding({ id: "f1", title: "No intent derived for this run", in_scope: null })];
    renderWithIntl(<FindingsPanel findings={findings} prId="pr1" />);
    expect(screen.getByText("No intent derived for this run")).toBeInTheDocument();
    expect(screen.queryByText(/outside the stated scope/i)).not.toBeInTheDocument();
  });
});
