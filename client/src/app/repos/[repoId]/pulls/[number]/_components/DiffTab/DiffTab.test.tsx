import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PrFile, SmartDiffResponse } from "@devdigest/shared";
import shellMessages from "../../../../../../../../messages/en/shell.json";
import prReviewMessages from "../../../../../../../../messages/en/prReview.json";
import { DiffTab } from "./DiffTab";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

// Deliberately NOT in role order — GitHub's own order, to make "Original
// order" restoring it a meaningful assertion (distinct from the grouped
// core→tests→wiring→docs→boilerplate order below).
const FILES: PrFile[] = [
  { path: "pnpm-lock.yaml", additions: 1, deletions: 0, patch: "@@ -1,1 +1,2 @@\n ctx\n+lock" },
  { path: "src/service.ts", additions: 1, deletions: 0, patch: "@@ -1,1 +1,2 @@\n ctx\n+core" },
  { path: "test/foo.test.ts", additions: 1, deletions: 0, patch: "@@ -1,1 +1,2 @@\n ctx\n+test" },
  { path: "README.md", additions: 1, deletions: 0, patch: "@@ -1,1 +1,2 @@\n ctx\n+doc" },
  { path: "src/modules/index.ts", additions: 1, deletions: 0, patch: "@@ -1,1 +1,2 @@\n ctx\n+wire" },
];

const SMART_DIFF: SmartDiffResponse = {
  groups: [
    { role: "core", files: [{ path: "src/service.ts", pseudocode_summary: null, additions: 1, deletions: 0, finding_lines: [] }] },
    { role: "tests", files: [{ path: "test/foo.test.ts", pseudocode_summary: null, additions: 1, deletions: 0, finding_lines: [] }] },
    { role: "wiring", files: [{ path: "src/modules/index.ts", pseudocode_summary: null, additions: 1, deletions: 0, finding_lines: [] }] },
    { role: "docs", files: [{ path: "README.md", pseudocode_summary: null, additions: 1, deletions: 0, finding_lines: [] }] },
    { role: "boilerplate", files: [{ path: "pnpm-lock.yaml", pseudocode_summary: null, additions: 1, deletions: 0, finding_lines: [] }] },
  ],
  split_suggestion: { too_big: false, total_lines: 5, proposed_splits: [] },
};

function mockFetch() {
  const fn = vi.fn(async (url: string) => {
    if (url.includes("/smart-diff")) {
      return new Response(JSON.stringify(SMART_DIFF), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.includes("/reviews")) {
      return new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } });
    }
    if (url.includes("/comments")) {
      return new Response(JSON.stringify([]), { status: 200, headers: { "content-type": "application/json" } });
    }
    return new Response(JSON.stringify(null), { status: 200, headers: { "content-type": "application/json" } });
  });
  vi.stubGlobal("fetch", fn);
  return fn;
}

function renderWithProviders(ui: React.ReactElement) {
  const qc = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return render(
    <QueryClientProvider client={qc}>
      <NextIntlClientProvider locale="en" messages={{ shell: shellMessages, prReview: prReviewMessages }}>
        {ui}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("DiffTab", () => {
  it("renders groups in fixed core→tests→wiring→docs→boilerplate order with docs/boilerplate collapsed, then the toggle restores GitHub's flat order", async () => {
    mockFetch();
    const { container } = renderWithProviders(
      <DiffTab
        prId="pr1"
        filesCount={FILES.length}
        files={FILES}
        canComment={false}
        repoFullName="acme/widgets"
        headSha="abc123"
      />,
    );

    // Wait for the grouped view (Smart Diff data loaded).
    await screen.findByText("Core");
    expect(screen.getByText("Tests")).toBeInTheDocument();
    expect(screen.getByText("Wiring")).toBeInTheDocument();
    expect(screen.getByText("Docs")).toBeInTheDocument();
    expect(screen.getByText("Boilerplate")).toBeInTheDocument();

    // Fixed role order, regardless of GitHub's file order.
    const text = container.textContent ?? "";
    const order = ["Core", "Tests", "Wiring", "Docs", "Boilerplate"].map((label) => text.indexOf(label));
    expect(order).toEqual([...order].sort((a, b) => a - b));

    // docs + boilerplate start collapsed: their file bodies are not rendered.
    expect(screen.getByText("src/service.ts")).toBeInTheDocument(); // core, open
    expect(screen.queryByText("README.md")).not.toBeInTheDocument(); // docs, collapsed
    expect(screen.queryByText("pnpm-lock.yaml")).not.toBeInTheDocument(); // boilerplate, collapsed

    // Toggle to "Original order" — restores GitHub's flat order, no re-fetch.
    const fetchCallsBefore = (fetch as ReturnType<typeof vi.fn>).mock.calls.length;
    fireEvent.click(screen.getByRole("button", { name: /original order/i }));

    await waitFor(() => {
      expect(screen.queryByText("Core")).not.toBeInTheDocument();
    });
    // All five files now render flat, and no new fetch was triggered.
    expect(screen.getByText("pnpm-lock.yaml")).toBeInTheDocument();
    expect(screen.getByText("README.md")).toBeInTheDocument();
    expect((fetch as ReturnType<typeof vi.fn>).mock.calls.length).toBe(fetchCallsBefore);

    const flatText = container.textContent ?? "";
    const flatOrder = FILES.map((f) => flatText.indexOf(f.path));
    expect(flatOrder).toEqual([...flatOrder].sort((a, b) => a - b));
  });
});
