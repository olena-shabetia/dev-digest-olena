import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent, within, act } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { PrMeta } from "@devdigest/shared";
import messages from "../../../../../../../messages/en/prReview.json";
import { FindingsCell } from "./FindingsCell";
import { HOVER_OPEN_MS } from "@/components/findings-popover";

afterEach(cleanup);

function pr(overrides: Partial<PrMeta>): PrMeta {
  return {
    id: "pr1",
    number: 482,
    title: "t",
    author: "a",
    branch: "b",
    base: "main",
    head_sha: "sha",
    additions: 1,
    deletions: 0,
    files_count: 1,
    status: "open",
    findings: null,
    ...overrides,
  } as PrMeta;
}

function renderCell(p: PrMeta) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      <FindingsCell pr={p} />
    </NextIntlClientProvider>,
  );
}

describe("FindingsCell", () => {
  it("never-reviewed PR renders '—' with no popover trigger", () => {
    renderCell(pr({ findings: null }));
    expect(screen.getByText("—")).toBeInTheDocument();
    expect(screen.queryByTestId("findings-popover")).not.toBeInTheDocument();
  });

  it("reviewed-and-clean PR renders 0, distinct from never-reviewed", () => {
    renderCell(pr({ findings: { critical: 0, warning: 0, suggestion: 0, total: 0, preview: [] } }));
    expect(screen.getByText("0")).toBeInTheDocument();
  });

  it("hovering reveals the popover titled 'N FINDINGS IN THIS RUN'", () => {
    vi.useFakeTimers();
    const findings = {
      critical: 1,
      warning: 1,
      suggestion: 0,
      total: 2,
      preview: [
        {
          severity: "CRITICAL" as const,
          category: "security" as const,
          title: "Hardcoded secret",
          file: "src/config.ts",
          start_line: 12,
          end_line: 12,
          confidence: 0.98,
          description: "A secret is committed.",
        },
        {
          severity: "WARNING" as const,
          category: "perf" as const,
          title: "N+1 query",
          file: "src/api/users.ts",
          start_line: 45,
          end_line: 52,
          confidence: 0.86,
          description: "One query per user.",
        },
      ],
    };
    renderCell(pr({ findings }));
    fireEvent.mouseEnter(screen.getByRole("group"));
    act(() => { vi.advanceTimersByTime(HOVER_OPEN_MS); });
    expect(screen.getByTestId("findings-popover")).toBeInTheDocument();
    expect(screen.getByText("2 findings in this run")).toBeInTheDocument();
    expect(screen.getByText("Hardcoded secret")).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("with repoFullName known, file:line becomes a link to GitHub at that line", () => {
    vi.useFakeTimers();
    render(
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <FindingsCell
          pr={pr({
            head_sha: "abc123",
            findings: {
              critical: 1,
              warning: 0,
              suggestion: 0,
              total: 1,
              preview: [
                {
                  severity: "CRITICAL" as const,
                  category: "security" as const,
                  title: "Hardcoded secret",
                  file: "src/config.ts",
                  start_line: 12,
                  end_line: 14,
                  confidence: 0.98,
                  description: "A secret is committed.",
                },
              ],
            },
          })}
          repoFullName="acme/payments-api"
        />
      </NextIntlClientProvider>,
    );
    fireEvent.mouseEnter(screen.getByRole("group"));
    act(() => { vi.advanceTimersByTime(HOVER_OPEN_MS); });
    const link = screen.getByRole("link", { name: /src\/config\.ts/ });
    expect(link).toHaveAttribute(
      "href",
      "https://github.com/acme/payments-api/blob/abc123/src/config.ts#L12-L14",
    );
    vi.useRealTimers();
  });

  it("moving the pointer from the trigger onto the popover keeps it open", () => {
    vi.useFakeTimers();
    renderCell(
      pr({
        findings: {
          critical: 1,
          warning: 0,
          suggestion: 0,
          total: 1,
          preview: [
            {
              severity: "CRITICAL" as const,
              category: "security" as const,
              title: "Hardcoded secret",
              file: "src/config.ts",
              start_line: 12,
              end_line: 12,
              confidence: 0.98,
              description: "A secret is committed.",
            },
          ],
        },
      }),
    );
    const trigger = screen.getByRole("group");
    fireEvent.mouseEnter(trigger);
    act(() => { vi.advanceTimersByTime(HOVER_OPEN_MS); });
    const popover = screen.getByTestId("findings-popover");
    fireEvent.mouseLeave(trigger);
    fireEvent.mouseEnter(popover);
    act(() => { vi.advanceTimersByTime(5_000); });
    expect(screen.getByTestId("findings-popover")).toBeInTheDocument();
    fireEvent.mouseLeave(popover);
    act(() => { vi.advanceTimersByTime(5_000); });
    expect(screen.queryByTestId("findings-popover")).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it("scrolling inside the popover's own finding list does not close it", () => {
    vi.useFakeTimers();
    renderCell(
      pr({
        findings: {
          critical: 1,
          warning: 0,
          suggestion: 0,
          total: 1,
          preview: [
            {
              severity: "CRITICAL" as const,
              category: "security" as const,
              title: "Hardcoded secret",
              file: "src/config.ts",
              start_line: 12,
              end_line: 12,
              confidence: 0.98,
              description: "A secret is committed.",
            },
          ],
        },
      }),
    );
    fireEvent.mouseEnter(screen.getByRole("group"));
    act(() => { vi.advanceTimersByTime(HOVER_OPEN_MS); });
    const popover = screen.getByTestId("findings-popover");
    fireEvent.scroll(popover, { target: { scrollTop: 40 } });
    expect(screen.getByTestId("findings-popover")).toBeInTheDocument();
    // A real page/container scroll (not inside the popover) still closes it —
    // the portaled, fixed-position popover doesn't track that kind of scroll.
    fireEvent.scroll(window);
    expect(screen.queryByTestId("findings-popover")).not.toBeInTheDocument();
    vi.useRealTimers();
  });

  it("the popover has no interactive content when the repo isn't known — no buttons or links", () => {
    vi.useFakeTimers();
    renderCell(
      pr({
        findings: {
          critical: 1,
          warning: 0,
          suggestion: 0,
          total: 1,
          preview: [
            {
              severity: "CRITICAL" as const,
              category: "security" as const,
              title: "Hardcoded secret",
              file: "src/config.ts",
              start_line: 12,
              end_line: 12,
              confidence: 0.98,
              description: "A secret is committed.",
            },
          ],
        },
      }),
    );
    fireEvent.mouseEnter(screen.getByRole("group"));
    act(() => { vi.advanceTimersByTime(HOVER_OPEN_MS); });
    const popover = screen.getByTestId("findings-popover");
    expect(within(popover).queryAllByRole("button")).toHaveLength(0);
    expect(within(popover).queryAllByRole("link")).toHaveLength(0);
    vi.useRealTimers();
  });

  it("shows every finding, not a truncated '+N more' subset — the list scrolls instead", () => {
    vi.useFakeTimers();
    const preview = Array.from({ length: 8 }, (_, i) => ({
      severity: "SUGGESTION" as const,
      category: "style" as const,
      title: `finding ${i}`,
      file: `src/f${i}.ts`,
      start_line: 1,
      end_line: 1,
      confidence: 0.6,
      description: "…",
    }));
    renderCell(pr({ findings: { critical: 0, warning: 0, suggestion: 8, total: 8, preview } }));
    fireEvent.mouseEnter(screen.getByRole("group"));
    act(() => { vi.advanceTimersByTime(HOVER_OPEN_MS); });
    expect(screen.queryByText(/more/)).not.toBeInTheDocument();
    expect(screen.getByText("finding 0")).toBeInTheDocument();
    expect(screen.getByText("finding 7")).toBeInTheDocument();
    vi.useRealTimers();
  });

  it("clicking the cell (with findings) does not bubble to a row click handler", () => {
    const onRowClick = vi.fn();
    render(
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        <div onClick={onRowClick}>
          <FindingsCell
            pr={pr({
              findings: {
                critical: 1,
                warning: 0,
                suggestion: 0,
                total: 1,
                preview: [
                  {
                    severity: "CRITICAL" as const,
                    category: "security" as const,
                    title: "Hardcoded secret",
                    file: "src/config.ts",
                    start_line: 12,
                    end_line: 12,
                    confidence: 0.98,
                    description: "A secret is committed.",
                  },
                ],
              },
            })}
          />
        </div>
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByRole("group"));
    expect(onRowClick).not.toHaveBeenCalled();
  });
});
