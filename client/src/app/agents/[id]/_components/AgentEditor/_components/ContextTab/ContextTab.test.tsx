import { describe, it, expect, afterEach, vi } from "vitest";
import { render, screen, cleanup, fireEvent } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { Agent } from "@devdigest/shared";
import type { SpecFile, ProjectContextListing, ContextAttachmentList } from "@/lib/types";
import contextTabsMessages from "../../../../../../../../messages/en/contextTabs.json";
import projectDocsMessages from "../../../../../../../../messages/en/projectDocs.json";
import { ToastProvider } from "@/lib/toast";

const useActiveRepo = vi.fn();
vi.mock("@/lib/repo-context", () => ({
  useActiveRepo: () => useActiveRepo(),
}));

const useProjectDocs = vi.fn();
const useAgentContextDocs = vi.fn();
const useSetAgentContextDocs = vi.fn();
vi.mock("@/lib/hooks/project-context", () => ({
  useProjectDocs: (...args: unknown[]) => useProjectDocs(...args),
  useAgentContextDocs: (...args: unknown[]) => useAgentContextDocs(...args),
  useSetAgentContextDocs: (...args: unknown[]) => useSetAgentContextDocs(...args),
}));

import { ContextTab } from "./ContextTab";

afterEach(() => {
  cleanup();
  useActiveRepo.mockReset();
  useProjectDocs.mockReset();
  useAgentContextDocs.mockReset();
  useSetAgentContextDocs.mockReset();
});

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

const DOCS: SpecFile[] = [
  { path: "specs/a.md", type: "specs", tokens: 10, truncated: false, used_by_agents: 0 },
  { path: "docs/b.md", type: "docs", tokens: 5, truncated: false, used_by_agents: 0 },
];
const LISTING: ProjectContextListing = { status: "ok", roots: ["**/{specs,docs,insights}/**/*.md"], docs: DOCS };

function activeRepo(repoId: string | null) {
  return { repoId, setRepoId: vi.fn(), repos: [], activeRepo: null, reposLoaded: true };
}

function renderTab() {
  return render(
    <NextIntlClientProvider
      locale="en"
      messages={{ contextTabs: contextTabsMessages, projectDocs: projectDocsMessages }}
    >
      <ToastProvider>
        <ContextTab agent={AGENT} />
      </ToastProvider>
    </NextIntlClientProvider>,
  );
}

describe("AgentEditor ContextTab", () => {
  it("calls the set-context mutation with {repoId, paths} on attach", () => {
    useActiveRepo.mockReturnValue(activeRepo("repo-1"));
    useProjectDocs.mockReturnValue({ data: LISTING, isLoading: false, isError: false, refetch: vi.fn() });
    const linked: ContextAttachmentList = { repo_id: "repo-1", paths: [] };
    useAgentContextDocs.mockReturnValue({ data: linked, isLoading: false, isError: false });
    const mutate = vi.fn();
    useSetAgentContextDocs.mockReturnValue({ mutate, isPending: false });

    renderTab();
    fireEvent.click(screen.getByRole("checkbox", { name: /attach specs\/a\.md/i }));

    expect(mutate).toHaveBeenCalledWith({ repoId: "repo-1", paths: ["specs/a.md"] }, expect.any(Object));
  });

  it("rolls back the checkbox when the mutation errors", () => {
    useActiveRepo.mockReturnValue(activeRepo("repo-1"));
    useProjectDocs.mockReturnValue({ data: LISTING, isLoading: false, isError: false, refetch: vi.fn() });
    const linked: ContextAttachmentList = { repo_id: "repo-1", paths: [] };
    useAgentContextDocs.mockReturnValue({ data: linked, isLoading: false, isError: false });
    const mutate = vi.fn((_vars, opts: { onError?: () => void }) => opts.onError?.());
    useSetAgentContextDocs.mockReturnValue({ mutate, isPending: false });

    renderTab();
    const checkbox = screen.getByRole("checkbox", { name: /attach specs\/a\.md/i });
    fireEvent.click(checkbox);

    expect(checkbox).not.toBeChecked();
    expect(screen.getByText("Could not save the attached documents.")).toBeInTheDocument();
  });

  it("reloads the attached set when the active repo switches", () => {
    useActiveRepo.mockReturnValue(activeRepo("repo-1"));
    useProjectDocs.mockReturnValue({ data: LISTING, isLoading: false, isError: false, refetch: vi.fn() });
    useAgentContextDocs.mockReturnValue({
      data: { repo_id: "repo-1", paths: ["specs/a.md"] } satisfies ContextAttachmentList,
      isLoading: false,
      isError: false,
    });
    useSetAgentContextDocs.mockReturnValue({ mutate: vi.fn(), isPending: false });

    const { rerender } = render(
      <NextIntlClientProvider
        locale="en"
        messages={{ contextTabs: contextTabsMessages, projectDocs: projectDocsMessages }}
      >
        <ToastProvider>
          <ContextTab agent={AGENT} />
        </ToastProvider>
      </NextIntlClientProvider>,
    );
    expect(screen.getByRole("checkbox", { name: /detach specs\/a\.md/i })).toBeChecked();

    useActiveRepo.mockReturnValue(activeRepo("repo-2"));
    useAgentContextDocs.mockReturnValue({
      data: { repo_id: "repo-2", paths: ["docs/b.md"] } satisfies ContextAttachmentList,
      isLoading: false,
      isError: false,
    });
    rerender(
      <NextIntlClientProvider
        locale="en"
        messages={{ contextTabs: contextTabsMessages, projectDocs: projectDocsMessages }}
      >
        <ToastProvider>
          <ContextTab agent={AGENT} />
        </ToastProvider>
      </NextIntlClientProvider>,
    );

    expect(screen.getByRole("checkbox", { name: /detach docs\/b\.md/i })).toBeChecked();
    expect(screen.getByRole("checkbox", { name: /attach specs\/a\.md/i })).not.toBeChecked();
  });

  it("shows the select-repo prompt with no checkboxes when there is no active repo", () => {
    useActiveRepo.mockReturnValue(activeRepo(null));
    useProjectDocs.mockReturnValue({ data: undefined, isLoading: false, isError: false, refetch: vi.fn() });
    useAgentContextDocs.mockReturnValue({ data: undefined, isLoading: false, isError: false });
    useSetAgentContextDocs.mockReturnValue({ mutate: vi.fn(), isPending: false });

    renderTab();

    expect(screen.getByText("Select a repository to see its documents.")).toBeInTheDocument();
    expect(screen.queryByRole("checkbox")).not.toBeInTheDocument();
  });
});
