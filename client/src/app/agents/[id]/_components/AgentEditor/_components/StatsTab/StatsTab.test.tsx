import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent, AgentStats, RunSummary } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/agents.json";

const STATS: AgentStats = {
  agent_id: "ag1",
  agent_name: "Test Quality Reviewer",
  runs: 6,
  findings_total: 10,
  accepted: 6,
  dismissed: 2,
  pending: 2,
  accept_rate: 0.75,
  dismiss_rate: 0.25,
  avg_findings_per_run: 1.67,
  total_cost_usd: 0.42,
  avg_cost_usd: 0.07,
  avg_latency_ms: 8200,
  findings_by_severity: { CRITICAL: 2, WARNING: 5, SUGGESTION: 3 },
  findings_by_category: { security: 4, bug: 6 },
  trend: [
    { label: "d1", value: 1 },
    { label: "d2", value: 3 },
  ],
};

const RUNS: RunSummary[] = [
  {
    run_id: "run1",
    agent_id: "ag1",
    agent_name: "Test Quality Reviewer",
    pr_number: 42,
    provider: "openai",
    model: "gpt-4.1",
    status: "done",
    error: null,
    duration_ms: 8000,
    tokens_in: 8200,
    tokens_out: 1300,
    cost_usd: 0.07,
    findings_count: 2,
    grounding: "diff",
    ran_at: "2026-09-01T00:00:00.000Z",
    score: 80,
    blockers: 0,
  },
];

vi.mock("../../../../../../../lib/hooks/agents", () => ({
  useAgentStats: () => ({ data: STATS, isLoading: false, isError: false, refetch: vi.fn() }),
  useAgentRuns: () => ({ data: RUNS, isLoading: false }),
}));

import { StatsTab } from "./StatsTab";

afterEach(cleanup);

const AGENT: Agent = {
  id: "ag1",
  name: "Test Quality Reviewer",
  description: "",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "You are a reviewer.",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 1,
};

function renderWithIntl(ui: React.ReactElement) {
  return render(<NextIntlClientProvider locale="en" messages={{ agents: messages }}>{ui}</NextIntlClientProvider>);
}

describe("StatsTab", () => {
  it("renders the summary tiles, severity breakdown and run history from real data", () => {
    renderWithIntl(<StatsTab agent={AGENT} />);
    expect(screen.getByText("Total runs (30d)")).toBeInTheDocument();
    expect(screen.getByText("6")).toBeInTheDocument();
    expect(screen.getByText("Findings by severity")).toBeInTheDocument();
    expect(screen.getByText("Run history")).toBeInTheDocument();
    expect(screen.getByText("#42")).toBeInTheDocument();
  });

  it("does not render a most-used-skills or most-pulled-memory panel", () => {
    renderWithIntl(<StatsTab agent={AGENT} />);
    expect(screen.queryByText(/most.used skills/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/most.pulled memory/i)).not.toBeInTheDocument();
  });
});
