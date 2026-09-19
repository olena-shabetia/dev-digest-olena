import { describe, it, expect, afterEach } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { RunCostBadge } from "./RunCostBadge";

afterEach(cleanup);

describe("RunCostBadge (smoke)", () => {
  it("compact variant renders just the cost", () => {
    render(<RunCostBadge costUsd={0.014} />);
    expect(screen.getByText("$0.014")).toBeInTheDocument();
  });

  it("detailed variant renders the tokens label + cost", () => {
    render(<RunCostBadge costUsd={0.0013} tokensLabel="9,119 tok" />);
    expect(screen.getByText("9,119 tok · $0.0013")).toBeInTheDocument();
  });

  it("an unknown cost renders '—', never '$0.00'", () => {
    render(<RunCostBadge costUsd={null} />);
    expect(screen.getByText("—")).toBeInTheDocument();
  });
});
