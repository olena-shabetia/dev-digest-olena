import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, waitFor, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { PrIntentRecord } from "@devdigest/shared";
import messages from "../../../../../../../../messages/en/prReview.json";
import { IntentCard } from "./IntentCard";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const FULL_RECORD: PrIntentRecord = {
  pr_id: "pr1",
  intent: "Add rate limiting to the payments webhook endpoint",
  in_scope: ["Rate limit the /webhooks/payments route", "Add a 429 response"],
  out_of_scope: ["Unrelated logging cleanup"],
  sources: [
    { kind: "title", status: "used", ref: null, chars: 42 },
    { kind: "issue", status: "used", ref: "#123", chars: 512 },
  ],
  confidence: "high",
  context_gaps: [],
  head_sha: "abc123",
  provider: "openrouter",
  model: "deepseek/deepseek-v4-flash",
  tokens_in: 500,
  tokens_out: 120,
  cost_usd: 0.001,
  error: null,
  generated_at: "2026-09-20T12:00:00.000Z",
};

const LOW_CONFIDENCE_RECORD: PrIntentRecord = {
  ...FULL_RECORD,
  pr_id: "pr2",
  confidence: "low",
  sources: [
    { kind: "title", status: "used", ref: null, chars: 20 },
    { kind: "issue", status: "unavailable", ref: "#999", chars: null },
  ],
  context_gaps: ["Could not fetch the linked issue body"],
};

/** Route responses by method + URL so the same mock covers GET and POST. */
function mockFetch(byPrId: Record<string, PrIntentRecord | null>) {
  const fn = vi.fn(async (url: string, init?: RequestInit) => {
    const match = url.match(/\/pulls\/([^/]+)\/intent/);
    const prId = match?.[1] ?? "";
    const method = init?.method ?? "GET";
    const body = method === "POST" ? { ...byPrId[prId], intent: `${byPrId[prId]?.intent} (re-derived)` } : byPrId[prId] ?? null;
    return new Response(JSON.stringify(body), {
      status: 200,
      headers: { "content-type": "application/json" },
    });
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
      <NextIntlClientProvider locale="en" messages={{ prReview: messages }}>
        {ui}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("IntentCard", () => {
  it("renders the full record — intent, both scope columns, confidence, sources — and Re-derive fires the mutation", async () => {
    const fetchMock = mockFetch({ pr1: FULL_RECORD });
    renderWithProviders(<IntentCard prId="pr1" />);

    expect(
      await screen.findByText(/Add rate limiting to the payments webhook endpoint/i),
    ).toBeInTheDocument();
    expect(screen.getByText("Rate limit the /webhooks/payments route")).toBeInTheDocument();
    expect(screen.getByText("Add a 429 response")).toBeInTheDocument();
    expect(screen.getByText("Unrelated logging cleanup")).toBeInTheDocument();
    expect(screen.getByText("High confidence")).toBeInTheDocument();
    expect(screen.getByText("Title")).toBeInTheDocument();
    expect(screen.getByText(/Linked issue/i)).toBeInTheDocument();
    expect(screen.getByText(/#123/)).toBeInTheDocument();

    const postCallsBefore = fetchMock.mock.calls.filter(
      ([, init]) => (init as RequestInit | undefined)?.method === "POST",
    ).length;
    fireEvent.click(screen.getByRole("button", { name: /re-derive/i }));

    await waitFor(() => {
      const postCallsAfter = fetchMock.mock.calls.filter(
        ([, init]) => (init as RequestInit | undefined)?.method === "POST",
      ).length;
      expect(postCallsAfter).toBe(postCallsBefore + 1);
    });
  });

  it("renders the warning state for a low-confidence record with an unavailable source, showing the context gap text", async () => {
    mockFetch({ pr2: LOW_CONFIDENCE_RECORD });
    renderWithProviders(<IntentCard prId="pr2" />);

    expect(await screen.findByText("Low confidence")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /Linked issue.*#999/i })).toBeInTheDocument();
    expect(screen.getByText("Could not fetch the linked issue body")).toBeInTheDocument();
  });

  it("renders the empty state, not a blank card, when the record is null (never derived)", async () => {
    mockFetch({ pr3: null });
    renderWithProviders(<IntentCard prId="pr3" />);

    expect(await screen.findByText("Intent not derived yet")).toBeInTheDocument();
    expect(
      screen.getByText("Derive the PR's intent and scope to help ground the review."),
    ).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /re-derive/i })).toBeInTheDocument();
  });
});
