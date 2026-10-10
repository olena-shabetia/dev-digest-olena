import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, fireEvent, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { FindingRecord } from "@devdigest/shared";
import messages from "../../../messages/en/prReview.json";
import { FindingCard } from "./FindingCard";

// The saved-case lookup comes from the page-level modal provider; stub it here.
let existingCase: { id: string; name: string } | undefined;
vi.mock("@/components/eval-case-modal", () => ({
  useEvalCaseModal: () => ({
    openForFinding: () => {},
    openForCase: () => {},
    caseForFinding: () => existingCase,
  }),
}));

afterEach(() => {
  cleanup();
  existingCase = undefined;
});

const FINDING: FindingRecord = {
  id: "f1",
  severity: "CRITICAL",
  category: "security",
  title: "Hardcoded Stripe secret key",
  file: "src/config.ts",
  start_line: 11,
  end_line: 11,
  rationale: "A **live** Stripe key is committed in source.",
  suggestion: "Move the key to an environment variable.",
  confidence: 0.95,
  kind: "finding",
  trifecta_components: null,
  evidence: null,
  review_id: "r1",
  accepted_at: null,
  dismissed_at: null,
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
      {ui}
    </NextIntlClientProvider>,
  );
}

describe("FindingCard (smoke, both themes)", () => {
  (["dark", "light"] as const).forEach((theme) => {
    it(`renders severity + file:line + rationale in ${theme}`, () => {
      renderWithIntl(
        <div data-theme={theme}>
          <FindingCard f={FINDING} defaultExpanded onAction={() => {}} />
        </div>,
      );
      expect(screen.getByText("Hardcoded Stripe secret key")).toBeInTheDocument();
      expect(screen.getByText("src/config.ts:11")).toBeInTheDocument();
      // category label is shown alongside the severity badge
      expect(screen.getByText("security")).toBeInTheDocument();
    });
  });

  it("fires accept/dismiss actions", () => {
    const onAction = vi.fn();
    renderWithIntl(<FindingCard f={FINDING} defaultExpanded onAction={onAction} />);
    fireEvent.click(screen.getByText("Accept"));
    expect(onAction).toHaveBeenCalledWith("accept");
    fireEvent.click(screen.getByText("Dismiss"));
    expect(onAction).toHaveBeenCalledWith("dismiss");
  });

  describe("Turn into eval case", () => {
    const accepted = { ...FINDING, accepted_at: "2026-10-09T08:00:00Z" };

    it("is disabled and explained while the finding is undecided", () => {
      renderWithIntl(<FindingCard f={FINDING} defaultExpanded onCreateEvalCase={() => {}} />);
      const btn = screen.getByRole("button", { name: /Turn into eval case/ });
      expect(btn).toBeDisabled();
      expect(btn).toHaveAttribute("title", "Accept or dismiss this finding first");
    });

    it("is enabled with an accent style once the finding is decided", () => {
      const onCreate = vi.fn();
      renderWithIntl(<FindingCard f={accepted} defaultExpanded onCreateEvalCase={onCreate} />);
      const btn = screen.getByRole("button", { name: /Turn into eval case/ });
      expect(btn).toBeEnabled();
      expect(btn.style.color).toBe("var(--accent-text)");
      fireEvent.click(btn);
      expect(onCreate).toHaveBeenCalledTimes(1);
    });

    it("marks a finding that already has a case and offers to edit it instead", () => {
      existingCase = { id: "c1", name: "Hardcoded Stripe secret key" };
      const onCreate = vi.fn();
      renderWithIntl(<FindingCard f={accepted} defaultExpanded onCreateEvalCase={onCreate} />);
      expect(screen.getByText("Eval case created")).toBeInTheDocument();
      expect(screen.queryByRole("button", { name: /Turn into eval case/ })).toBeNull();
      fireEvent.click(screen.getByRole("button", { name: /Edit eval case/ }));
      expect(onCreate).toHaveBeenCalledTimes(1);
    });

    it("shows no marker when the card has no eval entry point", () => {
      existingCase = { id: "c1", name: "x" };
      renderWithIntl(<FindingCard f={accepted} defaultExpanded />);
      expect(screen.queryByText("Eval case created")).toBeNull();
    });
  });
});
