import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import evalDashboard from "../../../../../../messages/en/evalDashboard.json";
import evalMessages from "../../../../../../messages/en/eval.json";
import { RegressionBanner } from "./RegressionBanner";

afterEach(cleanup);

function renderBanner(delta: Parameters<typeof RegressionBanner>[0]["delta"]) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ evalDashboard, eval: evalMessages }}>
      <RegressionBanner delta={delta} version="v7" />
    </NextIntlClientProvider>,
  );
}

describe("RegressionBanner", () => {
  it("names the metric that dipped, the version and what went up", () => {
    renderBanner({ recall: 0.04, precision: -0.02, citation_accuracy: 0.01 });
    expect(screen.getByRole("status")).toHaveTextContent(
      "Precision −2 pts dipped on v7 compared with the previous run.",
    );
    expect(screen.getByRole("status")).toHaveTextContent("Up: Recall +4 pts, Citation accuracy +1 pt.");
  });

  it("is hidden when nothing dipped by a whole point", () => {
    const { container } = renderBanner({ recall: 0.04, precision: -0.004, citation_accuracy: null });
    expect(container).toBeEmptyDOMElement();
  });

  it("is hidden without a previous run to compare against", () => {
    const { container } = renderBanner(null);
    expect(container).toBeEmptyDOMElement();
  });
});
