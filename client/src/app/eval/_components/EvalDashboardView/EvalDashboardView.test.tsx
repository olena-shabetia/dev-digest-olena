import { describe, it, expect, afterEach, vi, beforeEach } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { EvalDashboardIndex, EvalSetRunSummary } from "@devdigest/shared";
import evalDashboard from "../../../../../messages/en/evalDashboard.json";
import evalMessages from "../../../../../messages/en/eval.json";

const mutate = vi.fn();
let dashboard: EvalDashboardIndex;

vi.mock("@/lib/hooks/eval", () => ({
  useEvalDashboard: () => ({ data: dashboard, isLoading: false, isError: false, refetch: () => {} }),
  useRunAllEvalAgents: () => ({ mutate, isPending: false }),
}));

import { EvalDashboardView } from "./EvalDashboardView";

const run = (id: string, agentId: string, recall: number, at: string): EvalSetRunSummary =>
  ({
    id,
    agent_id: agentId,
    agent_name: "Security Reviewer",
    status: "completed",
    version_label: "v2",
    started_at: at,
    cases_total: 9,
    cases_passed: 7,
    cases_errored: 0,
    recall,
    precision: 0.9,
    citation_accuracy: 1,
  }) as EvalSetRunSummary;

const agent = (id: string, cases: number) => ({
  agent: { id, name: id === "a1" ? "Security Reviewer" : "Custom Mentor", provider: "openrouter", model: "m", version: 2 },
  cases_total: cases,
  latest_completed: cases ? run("r-new", id, 0.82, "2026-10-09T10:00:00Z") : null,
});

function renderView() {
  return render(
    <NextIntlClientProvider locale="en" messages={{ evalDashboard, eval: evalMessages }}>
      <EvalDashboardView />
    </NextIntlClientProvider>,
  );
}

beforeEach(() => mutate.mockClear());
afterEach(cleanup);

describe("EvalDashboardView", () => {
  it("shows each agent's name in primary ink with its three metrics", () => {
    dashboard = {
      agents: [agent("a1", 9)],
      recent_runs: [run("r-new", "a1", 0.82, "2026-10-09T10:00:00Z"), run("r-old", "a1", 0.7, "2026-10-08T10:00:00Z")],
    };
    renderView();
    const name = screen.getAllByText("Security Reviewer")[0]!;
    expect(name.style.color).toBe("var(--text-primary)");
    expect(screen.getByText("Prec")).toBeInTheDocument();
    expect(screen.getByText("Cite")).toBeInTheDocument();
    expect(screen.getByRole("img", { name: "Recall trend" })).toBeInTheDocument();
  });

  it("starts runs only for agents that have eval cases", () => {
    dashboard = { agents: [agent("a1", 9), agent("a2", 0)], recent_runs: [] };
    renderView();
    fireEvent.click(screen.getByRole("button", { name: /Run all agents/ }));
    expect(mutate).toHaveBeenCalledTimes(1);
    expect(mutate.mock.calls[0]![0]).toEqual(["a1"]);
  });

  it("disables Run all agents when no agent has eval cases", () => {
    dashboard = { agents: [agent("a2", 0)], recent_runs: [] };
    renderView();
    expect(screen.getByRole("button", { name: /Run all agents/ })).toBeDisabled();
  });
});
