import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import evalMessages from "../../../messages/en/eval.json";
import { EvalMetricBar } from "./EvalMetricBar";

afterEach(cleanup);

const renderBar = (value: number | null) =>
  render(
    <NextIntlClientProvider locale="en" messages={{ eval: evalMessages }}>
      <EvalMetricBar value={value} metric="precision" />
    </NextIntlClientProvider>,
  );

describe("EvalMetricBar", () => {
  it("shows the percent and a bar filled to that width in the metric colour", () => {
    const { container } = renderBar(0.82);
    expect(screen.getByText("82%")).toBeInTheDocument();
    const fill = container.querySelector<HTMLElement>("[aria-hidden] > div");
    expect(fill?.style.width).toBe("82%");
    expect(fill?.style.background).toBe("var(--ok)");
  });

  it("has no bar for a metric that is not applicable", () => {
    const { container } = renderBar(null);
    expect(screen.getByText("n/a")).toBeInTheDocument();
    expect(container.querySelector("[aria-hidden]")).toBeNull();
  });
});
