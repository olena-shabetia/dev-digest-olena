import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalSetRunSummary } from "@devdigest/shared";
import evalDashboard from "../../../../../../messages/en/evalDashboard.json";
import evalMessages from "../../../../../../messages/en/eval.json";
import { MetricTrendChart } from "./MetricTrendChart";

afterEach(cleanup);

const run = (id: string, status: EvalSetRunSummary["status"]): EvalSetRunSummary =>
  ({
    id,
    status,
    version_label: "v1",
    started_at: "2026-10-09T10:00:00Z",
    recall: 0.8,
    precision: 0.9,
    citation_accuracy: 1,
  }) as EvalSetRunSummary;

function renderChart(runs: EvalSetRunSummary[]) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ evalDashboard, eval: evalMessages }}>
      <MetricTrendChart runs={runs} />
    </NextIntlClientProvider>,
  );
}

describe("MetricTrendChart", () => {
  it("always shows the legend with the three metrics", () => {
    renderChart([]);
    expect(screen.getByText("Recall")).toBeInTheDocument();
    expect(screen.getByText("Precision")).toBeInTheDocument();
    expect(screen.getByText("Citation accuracy")).toBeInTheDocument();
  });

  it("asks for a second run instead of drawing a one-point line", () => {
    renderChart([run("a", "completed"), run("b", "failed"), run("c", "running")]);
    expect(screen.getByText(/at least twice/i)).toBeInTheDocument();
  });
});
