import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import messages from "../../../messages/en/prReview.json";
import { SeverityFilterBar } from "./SeverityFilterBar";

afterEach(cleanup);

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const BUCKETS = [
  { severity: "CRITICAL" as const, count: 1 },
  { severity: "WARNING" as const, count: 2 },
];

describe("SeverityFilterBar", () => {
  it("renders one interactive pill per bucket when onSelect is given", () => {
    renderWithIntl(<SeverityFilterBar buckets={BUCKETS} onSelect={vi.fn()} />);
    expect(screen.getAllByRole("button")).toHaveLength(2);
  });

  it("without onSelect it renders no buttons at all — read-only Timeline use", () => {
    renderWithIntl(<SeverityFilterBar buckets={BUCKETS} />);
    expect(screen.queryAllByRole("button")).toHaveLength(0);
    expect(screen.getByText("1")).toBeInTheDocument();
  });

  it("marks the selected pill aria-pressed", () => {
    renderWithIntl(<SeverityFilterBar buckets={BUCKETS} selected="CRITICAL" onSelect={vi.fn()} />);
    const buttons = screen.getAllByRole("button");
    expect(buttons[0]).toHaveAttribute("aria-pressed", "true");
    expect(buttons[1]).toHaveAttribute("aria-pressed", "false");
  });

  it("clicking a pill reports its severity to onSelect", async () => {
    const onSelect = vi.fn();
    renderWithIntl(<SeverityFilterBar buckets={BUCKETS} onSelect={onSelect} />);
    screen.getAllByRole("button")[0]!.click();
    expect(onSelect).toHaveBeenCalledWith("CRITICAL");
  });

  it("renders nothing for an empty bucket list", () => {
    const { container } = renderWithIntl(<SeverityFilterBar buckets={[]} onSelect={vi.fn()} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("compact mode omits the text label", () => {
    renderWithIntl(<SeverityFilterBar buckets={BUCKETS} compact onSelect={vi.fn()} />);
    expect(screen.queryByText("Critical")).not.toBeInTheDocument();
    expect(screen.queryByText("Warning")).not.toBeInTheDocument();
  });
});
