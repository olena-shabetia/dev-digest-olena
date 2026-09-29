import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { RunTrace } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/runs.json"; // apps/web/messages/en/runs.json

// Mock the trace hooks so the drawer renders without a query client / SSE.
const TRACE: RunTrace = {
  config: { agent: "Security", version: "1", provider: "openai", model: "gpt-4.1", pr: 482, source: "local" },
  stats: { duration_ms: 8200, tokens_in: 12000, tokens_out: 1500, cost_usd: 0.06, findings: 2, grounding: "2/2 passed" },
  prompt_assembly: { system: "You are a reviewer.", skills: "### skill", memory: null, specs: null, user: "Review PR #482" },
  tool_calls: [{ tool: "review_file", args: "src/config.ts", meta: "single-pass", ms: 1200 }],
  raw_output: '{"verdict":"request_changes"}',
  memory_pulled: [{ pr: 471, text: "rate-limit public endpoints" }],
  specs_read: [],
  log: [
    { t: "00.10", kind: "info", msg: "Starting review with agent Security" },
    { t: "00.90", kind: "result", msg: "Citation grounding: 2/2 passed" },
  ],
};

// L05 — a trace carrying a Project-context prompt block (with the untrusted
// delimiter lines a real assembly would emit) plus per-document specs_read_detail.
const SPECS_RAW = [
  '<untrusted source="specs/a.md">',
  "### specs/a.md",
  "first doc body",
  "</untrusted>",
].join("\n");

const TRACE_WITH_SPECS: RunTrace = {
  ...TRACE,
  prompt_assembly: { ...TRACE.prompt_assembly, specs: SPECS_RAW, specs_tokens: 42 },
  specs_read: ["specs/a.md"],
  specs_read_detail: [{ path: "specs/a.md", tokens: 42, truncated: true }],
};

let currentTrace = TRACE;

vi.mock("../../../../../../../lib/hooks/trace", () => ({
  useRunTrace: () => ({ data: currentTrace, isLoading: false }),
}));
vi.mock("../../../../../../../lib/hooks/reviews", () => ({
  useRunEvents: () => ({ events: [], running: false }),
}));

import RunTraceDrawer from "./RunTraceDrawer";

afterEach(() => {
  currentTrace = TRACE;
  cleanup();
});

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ runs: messages }}>
      <div data-theme="dark">{ui}</div>
    </NextIntlClientProvider>,
  );
}

describe("A5 Run Trace drawer (smoke)", () => {
  it("renders the trace tabs and stats", () => {
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    expect(screen.getByText("Configuration")).toBeInTheDocument();
    expect(screen.getByText("Stats")).toBeInTheDocument();
    expect(screen.getByText("2/2 passed")).toBeInTheDocument();
    expect(screen.getByText("Tool calls")).toBeInTheDocument();
    // COST stat tile (L01) — adaptive precision, never "$0.00".
    expect(screen.getByText("$0.060")).toBeInTheDocument();
  });

  it("switches to the live log tab", () => {
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    fireEvent.click(screen.getByText("log"));
    // LiveLogStream renders its filter input
    expect(screen.getByPlaceholderText("Filter log…")).toBeInTheDocument();
  });

  it("renders the old pre-L05 trace fixture (no specs_read_detail) without error", () => {
    currentTrace = TRACE;
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    expect(screen.getByText("Configuration")).toBeInTheDocument();
    expect(screen.getByText("none")).toBeInTheDocument(); // specs_read: [] fallback
  });

  it("shows the relabeled specs row, per-doc tokens, and the Skills row untouched", () => {
    currentTrace = TRACE_WITH_SPECS;
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    // Prompt assembly is collapsed by default — expand it first.
    fireEvent.click(screen.getByText("Prompt assembly"));
    // Relabeled Project-context row (SPEC-03 AC-19)
    expect(screen.getByText("Project context — attached specs (untrusted)")).toBeInTheDocument();
    // Specs read row: path + per-doc tokens + truncated marker
    expect(screen.getByText(/specs\/a\.md \(~42 tok, truncated\)/)).toBeInTheDocument();
    // Skills row still renders its raw persisted text, unaffected by stripping
    expect(screen.getByText("Skills (dynamic)")).toBeInTheDocument();
  });

  it("opens the specs modal only from the expand icon button, strips delimiter lines, and Escape closes it while the trace section stays open", () => {
    currentTrace = TRACE_WITH_SPECS;
    renderWithIntl(<RunTraceDrawer runId="r1" agentName="Security" prNumber={482} onClose={() => {}} />);
    // Prompt assembly is collapsed by default — expand it first.
    fireEvent.click(screen.getByText("Prompt assembly"));

    const specsLabel = "Project context — attached specs (untrusted)";
    const specsLabelEl = screen.getByText(specsLabel);
    const specsHead = specsLabelEl.closest("div") as HTMLElement;
    // The RunTraceDrawer itself is a `role="dialog"` (kit Drawer) — that one
    // is always present; the fullscreen prompt modal is a second one.
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    // Clicking the row (not the icon) only toggles the inline preview, no modal.
    fireEvent.click(specsLabelEl);
    expect(screen.getAllByRole("dialog")).toHaveLength(1);

    // Only this row's expand-icon button opens the fullscreen modal.
    fireEvent.click(within(specsHead).getByLabelText("Open fullscreen"));
    const dialogs = screen.getAllByRole("dialog");
    expect(dialogs).toHaveLength(2);
    const modal = dialogs.at(-1);
    if (!modal) throw new Error("expected the fullscreen prompt modal to be open");
    // Modal title equals the row label.
    expect(within(modal).getByText(specsLabel)).toBeInTheDocument();
    // Delimiter lines are gone from the modal body; the doc content remains.
    expect(within(modal).queryByText(/<untrusted source=/)).not.toBeInTheDocument();
    expect(within(modal).queryByText(/<\/untrusted>/)).not.toBeInTheDocument();
    expect(within(modal).getByText(/first doc body/)).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.getAllByRole("dialog")).toHaveLength(1);
    // The trace section (Configuration) is still open/rendered.
    expect(screen.getByText("Configuration")).toBeInTheDocument();
  });
});
