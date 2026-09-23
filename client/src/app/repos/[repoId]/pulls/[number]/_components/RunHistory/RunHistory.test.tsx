/**
 * RunHistory — the badge must reflect the review OUTCOME, not the run lifecycle.
 * Regression guard for the "green ✓ done on a run that found 5 blockers" bug:
 * a settled run is colored/labelled by its denormalized blocker/finding counts,
 * and shows the review score ring.
 */
import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { RunSummary, FindingRecord } from "@devdigest/shared";
import type { SeverityBucket } from "@/lib/severity";
import { HOVER_OPEN_MS } from "@/components/findings-popover";
import messages from "../../../../../../../../messages/en/prReview.json";
import { RunHistory } from "./RunHistory";

afterEach(cleanup);

function run(o: Partial<RunSummary>): RunSummary {
  return {
    run_id: "run-1",
    agent_id: "a1",
    agent_name: "Security Reviewer",
    pr_number: 482,
    provider: "openrouter",
    model: "deepseek/deepseek-v4-flash",
    status: "done",
    error: null,
    duration_ms: 1000,
    tokens_in: 100,
    tokens_out: 50,
    cost_usd: 0.0013,
    findings_count: 0,
    grounding: "0/0 passed",
    ran_at: "2026-06-11T18:44:34.000Z",
    score: null,
    blockers: null,
    ...o,
  };
}

function renderRuns(
  runs: RunSummary[],
  severityByRun?: Map<string, SeverityBucket[]>,
  findingsByRun?: Map<string, FindingRecord[]>,
  repo?: { repoFullName?: string | null; headSha?: string | null },
) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <RunHistory
        runs={runs}
        onOpenTrace={() => {}}
        severityByRun={severityByRun}
        findingsByRun={findingsByRun}
        repoFullName={repo?.repoFullName}
        headSha={repo?.headSha}
      />
    </NextIntlClientProvider>,
  );
}

function finding(o: Partial<FindingRecord>): FindingRecord {
  return {
    id: "f1",
    severity: "CRITICAL",
    category: "security",
    title: "t",
    file: "src/a.ts",
    start_line: 1,
    end_line: 1,
    rationale: "r",
    suggestion: null,
    confidence: 0.9,
    kind: null,
    review_id: "rev1",
    accepted_at: null,
    dismissed_at: null,
    ...o,
  } as FindingRecord;
}

describe("RunHistory — outcome badge", () => {
  it("a done run WITH blockers reads 'rejected' (never green 'done') + shows the score ring", () => {
    renderRuns([run({ status: "done", findings_count: 5, blockers: 5, score: 0 })]);
    expect(screen.getByText("rejected")).toBeInTheDocument();
    expect(screen.queryByText("done")).not.toBeInTheDocument();
    expect(screen.getByText("0")).toBeInTheDocument(); // CircularScore renders the number
    expect(screen.getByText(/5 blockers/)).toBeInTheDocument();
  });

  it("a clean done run reads 'approved'", () => {
    renderRuns([run({ status: "done", findings_count: 0, blockers: 0, score: 95 })]);
    expect(screen.getByText("approved")).toBeInTheDocument();
    expect(screen.getByText("95")).toBeInTheDocument();
  });

  it("a done run with non-blocking findings reads 'reviewed'", () => {
    renderRuns([run({ status: "done", findings_count: 3, blockers: 0, score: 72 })]);
    expect(screen.getByText("reviewed")).toBeInTheDocument();
    expect(screen.queryByText(/blockers/)).not.toBeInTheDocument();
  });

  it("a failed run reads 'error'", () => {
    renderRuns([run({ status: "failed", error: "boom", score: null, blockers: null })]);
    expect(screen.getByText("error")).toBeInTheDocument();
  });

  it("a running run reads 'running'", () => {
    renderRuns([run({ status: "running", score: null, blockers: null })]);
    expect(screen.getByText("running")).toBeInTheDocument();
  });

  it("a settled run shows tokens + cost (never $0.00 for a known cost)", () => {
    renderRuns([
      run({ status: "done", tokens_in: 9119, tokens_out: 1180, cost_usd: 0.0013 }),
    ]);
    expect(screen.getByText("10,299 tok · $0.0013")).toBeInTheDocument();
  });

  it("an unknown cost renders '—', never '$0.00'", () => {
    renderRuns([run({ status: "done", tokens_in: 500, tokens_out: 50, cost_usd: null })]);
    expect(screen.getByText("550 tok · —")).toBeInTheDocument();
  });
});

describe("RunHistory — per-run severity chips", () => {
  it("renders a chip per severity present for that run", () => {
    const severityByRun = new Map<string, SeverityBucket[]>([
      ["run-1", [{ severity: "CRITICAL", count: 1 }, { severity: "WARNING", count: 2 }]],
    ]);
    renderRuns([run({ status: "done", findings_count: 3 })], severityByRun);
    expect(screen.getAllByText("1")).not.toHaveLength(0);
    expect(screen.getAllByText("2")).not.toHaveLength(0);
  });

  it("chips are read-only — not clickable — in the Timeline", () => {
    const severityByRun = new Map<string, SeverityBucket[]>([
      ["run-1", [{ severity: "CRITICAL", count: 1 }]],
    ]);
    renderRuns([run({ status: "done", findings_count: 1 })], severityByRun);
    expect(screen.queryAllByRole("button", { name: /critical/i })).toHaveLength(0);
  });

  it("a run absent from the map falls back to the plain findings/blockers text", () => {
    renderRuns([run({ status: "done", findings_count: 3, blockers: 0 })], new Map());
    expect(screen.getByText(/3 finding/)).toBeInTheDocument();
  });
});

describe("RunHistory — Timeline findings popover", () => {
  it("hovering a run's severity chips opens the same 'N FINDINGS IN THIS RUN' popover as the PR list", () => {
    vi.useFakeTimers();
    const severityByRun = new Map<string, SeverityBucket[]>([
      ["run-1", [{ severity: "CRITICAL", count: 1 }]],
    ]);
    const findingsByRun = new Map<string, FindingRecord[]>([
      ["run-1", [finding({ title: "Hardcoded secret" })]],
    ]);
    renderRuns([run({ status: "done", findings_count: 1 })], severityByRun, findingsByRun);
    fireEvent.mouseEnter(screen.getByRole("group"));
    act(() => {
      vi.advanceTimersByTime(HOVER_OPEN_MS);
    });
    expect(screen.getByTestId("findings-popover")).toBeInTheDocument();
    expect(screen.getByText("1 finding in this run")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("the Timeline popover has no buttons, and no link when the repo isn't known", () => {
    vi.useFakeTimers();
    const severityByRun = new Map<string, SeverityBucket[]>([
      ["run-1", [{ severity: "CRITICAL", count: 1 }]],
    ]);
    const findingsByRun = new Map<string, FindingRecord[]>([["run-1", [finding({})]]]);
    renderRuns([run({ status: "done", findings_count: 1 })], severityByRun, findingsByRun);
    fireEvent.mouseEnter(screen.getByRole("group"));
    act(() => {
      vi.advanceTimersByTime(HOVER_OPEN_MS);
    });
    const popover = screen.getByTestId("findings-popover");
    expect(within(popover).queryAllByRole("button")).toHaveLength(0);
    expect(within(popover).queryAllByRole("link")).toHaveLength(0);
    vi.useRealTimers();
  });

  it("with repoFullName + headSha known, the Timeline popover's file:line links to GitHub", () => {
    vi.useFakeTimers();
    const severityByRun = new Map<string, SeverityBucket[]>([
      ["run-1", [{ severity: "CRITICAL", count: 1 }]],
    ]);
    const findingsByRun = new Map<string, FindingRecord[]>([
      ["run-1", [finding({ file: "src/a.ts", start_line: 5, end_line: 5 })]],
    ]);
    renderRuns([run({ status: "done", findings_count: 1 })], severityByRun, findingsByRun, {
      repoFullName: "acme/payments-api",
      headSha: "def456",
    });
    fireEvent.mouseEnter(screen.getByRole("group"));
    act(() => {
      vi.advanceTimersByTime(HOVER_OPEN_MS);
    });
    const link = screen.getByRole("link", { name: /src\/a\.ts/ });
    expect(link).toHaveAttribute("href", "https://github.com/acme/payments-api/blob/def456/src/a.ts#L5");
    vi.useRealTimers();
  });

  it("moving the pointer onto the popover keeps it open past the close delay", () => {
    vi.useFakeTimers();
    const severityByRun = new Map<string, SeverityBucket[]>([
      ["run-1", [{ severity: "CRITICAL", count: 1 }]],
    ]);
    const findingsByRun = new Map<string, FindingRecord[]>([["run-1", [finding({})]]]);
    renderRuns([run({ status: "done", findings_count: 1 })], severityByRun, findingsByRun);
    const trigger = screen.getByRole("group");
    fireEvent.mouseEnter(trigger);
    act(() => {
      vi.advanceTimersByTime(HOVER_OPEN_MS);
    });
    const popover = screen.getByTestId("findings-popover");
    fireEvent.mouseLeave(trigger);
    fireEvent.mouseEnter(popover);
    act(() => {
      vi.advanceTimersByTime(5_000);
    });
    expect(screen.getByTestId("findings-popover")).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("without findingsByrun, the chips render with no popover (unchanged behavior)", () => {
    const severityByRun = new Map<string, SeverityBucket[]>([
      ["run-1", [{ severity: "CRITICAL", count: 1 }]],
    ]);
    renderRuns([run({ status: "done", findings_count: 1 })], severityByRun);
    expect(screen.queryByTestId("findings-popover")).not.toBeInTheDocument();
    expect(screen.queryByRole("group")).not.toBeInTheDocument();
  });
});
