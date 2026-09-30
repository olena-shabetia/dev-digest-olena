import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent } from "@devdigest/shared";
import messages from "../../../../../../messages/en/agents.json";
import contextTabsMessages from "../../../../../../messages/en/contextTabs.json";
import projectDocsMessages from "../../../../../../messages/en/projectDocs.json";
import { ToastProvider } from "../../../../../lib/toast";

// Mock the data hooks so the editor renders without a network/query client.
vi.mock("../../../../../lib/hooks/agents", () => ({
  useUpdateAgent: () => ({ mutate: vi.fn(), isPending: false, isSuccess: false, data: undefined }),
  useProviderModels: () => ({ data: [{ id: "gpt-4.1", provider: "openai" }] }),
}));

// The Context tab (L05) pulls its own repo/doc hooks — mock them so the
// default (Config) render stays a pure smoke test.
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => ({ repoId: null, setRepoId: vi.fn(), repos: [], activeRepo: null, reposLoaded: true }),
}));
vi.mock("@/lib/hooks/project-context", () => ({
  useProjectDocs: () => ({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() }),
  useAgentContextDocs: () => ({ data: undefined, isLoading: false, isError: false }),
  useSetAgentContextDocs: () => ({ mutate: vi.fn(), isPending: false }),
}));

import { AgentEditor } from "./AgentEditor";

afterEach(cleanup);

const AGENT: Agent = {
  id: "ag1",
  name: "Security Reviewer",
  description: "Flags secrets and injection",
  provider: "openai",
  model: "gpt-4.1",
  system_prompt: "You are a security reviewer.",
  output_schema: null,
  strategy: "single-pass",
  ci_fail_on: "critical",
  repo_intel: true,
  enabled: true,
  version: 1,
};

function renderWithIntl(ui: React.ReactElement) {
  return render(
    <NextIntlClientProvider
      locale="en"
      messages={{ agents: messages, contextTabs: contextTabsMessages, projectDocs: projectDocsMessages }}
    >
      <ToastProvider>{ui}</ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("A2 Agent Editor (smoke)", () => {
  it("renders the Config tab fields", () => {
    renderWithIntl(<AgentEditor agent={AGENT} tab="config" onTab={() => {}} />);
    expect(screen.getByText("Config")).toBeInTheDocument();
    expect(screen.getByText("Configuration")).toBeInTheDocument();
    expect(screen.getByText("Save agent")).toBeInTheDocument();
  });

  it("renders the Context tab", () => {
    renderWithIntl(<AgentEditor agent={AGENT} tab="context" onTab={() => {}} />);
    expect(screen.getByText("Project context")).toBeInTheDocument();
  });
});
