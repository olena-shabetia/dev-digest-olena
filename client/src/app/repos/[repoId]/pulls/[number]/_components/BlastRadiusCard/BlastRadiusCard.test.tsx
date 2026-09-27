import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import type { BlastRadiusResponse } from "@devdigest/shared";
import blastMessages from "../../../../../../../../messages/en/blast.json";
import briefMessages from "../../../../../../../../messages/en/brief.json";
import commonMessages from "../../../../../../../../messages/en/common.json";
import { BlastRadiusCard } from "./BlastRadiusCard";
import { githubBlobUrl } from "@/lib/github-urls";

afterEach(() => {
  cleanup();
  vi.unstubAllGlobals();
});

const REPO_FULL_NAME = "acme/payments-api";
const HEAD_SHA = "abc123";

const HAPPY_DATA: BlastRadiusResponse = {
  changed_symbols: [{ name: "rateLimit", file: "src/mw/rateLimit.ts", kind: "function" }],
  downstream: [
    {
      symbol: "rateLimit",
      callers: [{ name: "publicRouter", file: "src/routes/public.ts", line: 23 }],
      endpoints_affected: ["GET /api/public/items"],
      crons_affected: ["job:reset-rate-buckets"],
    },
  ],
  summary: "1 changed symbol(s), 1 caller(s), 1 endpoint(s), 1 cron job(s)",
  endpoints: ["GET /api/public/items"],
  crons: ["job:reset-rate-buckets"],
  facts_by_file: {
    "src/routes/public.ts": { endpoints: ["GET /api/public/items"], crons: ["job:reset-rate-buckets"] },
  },
  stats: { symbols: 1, callers: 1, endpoints: 1, crons: 1 },
  degraded: false,
  reason: null,
};

const DEGRADED_DATA: BlastRadiusResponse = {
  ...HAPPY_DATA,
  degraded: true,
  reason: "index_failed",
};

const EMPTY_DATA: BlastRadiusResponse = {
  changed_symbols: [{ name: "rateLimit", file: "src/mw/rateLimit.ts", kind: "function" }],
  downstream: [],
  summary: "1 changed symbol(s), 0 caller(s), 0 endpoint(s), 0 cron job(s)",
  endpoints: [],
  crons: [],
  facts_by_file: {},
  stats: { symbols: 1, callers: 0, endpoints: 0, crons: 0 },
  degraded: false,
  reason: null,
};

function mockFetch(byPrId: Record<string, BlastRadiusResponse>) {
  const fn = vi.fn(async (url: string) => {
    const match = url.match(/\/pulls\/([^/]+)\/blast/);
    const prId = match?.[1] ?? "";
    return new Response(JSON.stringify(byPrId[prId] ?? null), {
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
      <NextIntlClientProvider
        locale="en"
        messages={{ blast: blastMessages, brief: briefMessages, common: commonMessages }}
      >
        {ui}
      </NextIntlClientProvider>
    </QueryClientProvider>,
  );
}

describe("BlastRadiusCard", () => {
  it("renders stats, an expanded caller with a working link, endpoint/cron pills, collapses, and switches to the graph view", async () => {
    mockFetch({ pr1: HAPPY_DATA });
    renderWithProviders(
      <BlastRadiusCard prId="pr1" repoFullName={REPO_FULL_NAME} headSha={HEAD_SHA} />,
    );

    expect(await screen.findByText("1 symbols")).toBeInTheDocument();
    expect(screen.getAllByText("1 callers").length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText("1 endpoints")).toBeInTheDocument();
    expect(screen.getByText("1 cron/jobs")).toBeInTheDocument();

    const collapseBtn = screen.getByRole("button", { name: /collapse rateLimit/i });
    expect(collapseBtn).toHaveAttribute("aria-expanded", "true");

    const expectedHref = githubBlobUrl(REPO_FULL_NAME, HEAD_SHA, "src/routes/public.ts", 23);
    const callerLink = screen.getByRole("link", { name: /src\/routes\/public\.ts:23/i });
    expect(callerLink).toHaveAttribute("href", expectedHref);

    expect(screen.getByText("GET /api/public/items")).toBeInTheDocument();
    // Row header shows a plain count, the expanded badge shows the humanized
    // cadence/name — never the raw "job:reset-rate-buckets" fact.
    expect(screen.getByText("1 cron")).toBeInTheDocument();
    expect(screen.getByText("reset rate buckets")).toBeInTheDocument();

    fireEvent.click(collapseBtn);
    expect(screen.getByRole("button", { name: /expand rateLimit/i })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.queryByRole("link", { name: /src\/routes\/public\.ts:23/i })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "graph" }));
    expect(await screen.findByRole("img", { name: "Blast radius graph" })).toBeInTheDocument();
  });

  it("shows the degraded status alongside the tree data", async () => {
    mockFetch({ pr2: DEGRADED_DATA });
    renderWithProviders(
      <BlastRadiusCard prId="pr2" repoFullName={REPO_FULL_NAME} headSha={HEAD_SHA} />,
    );

    expect(
      await screen.findByText("The repo index lookup failed, so results may be incomplete."),
    ).toBeInTheDocument();
    expect(screen.getByRole("status")).toBeInTheDocument();
    expect(screen.getByText("rateLimit")).toBeInTheDocument();
  });

  it("shows the no-downstream-callers message and no tree rows when empty and not degraded", async () => {
    mockFetch({ pr3: EMPTY_DATA });
    renderWithProviders(
      <BlastRadiusCard prId="pr3" repoFullName={REPO_FULL_NAME} headSha={HEAD_SHA} />,
    );

    expect(
      await screen.findByText("1 changed symbol(s), no downstream callers found."),
    ).toBeInTheDocument();
    expect(screen.queryByText("rateLimit")).not.toBeInTheDocument();
    expect(screen.queryByRole("status")).not.toBeInTheDocument();
  });
});
